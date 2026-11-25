// Hosptic analysis engine.
// Turns a question (plus the conversation's running context) into a computed
// analysis with a layered response: finding, explanation, evidence,
// interpretation, technical detail and follow-up questions.
//
// Question understanding is rule-based so it runs without any external service.
// It can be replaced by a language model that emits the same `plan` object; the
// statistics below stay the same either way.

import { DATASETS, loadRows } from "./datasets.js";
import {
  mean, sd, median, quantile, fiveNumber, wilson, chiSquareTest, welchT, anova,
  pearson, riskRatio, twoPropZ, holm, fmtP, pct, r2,
} from "./stats.js";

// ---------------------------------------------------------------------------
// Risk factors the "what drove this?" analysis screens, per dataset.
const FACTORS = {
  maternal: [
    { key: "hypertension", label: "Hypertension", test: (r) => r.hypertension, needs: "hypertension" },
    { key: "anaemia", label: "Anaemia", test: (r) => r.anaemia, needs: "anaemia" },
    { key: "diabetes", label: "Diabetes", test: (r) => r.diabetes, needs: "diabetes" },
    { key: "low_anc", label: "Fewer than 4 antenatal visits", test: (r) => r.antenatal_visits < 4, needs: "antenatal_visits" },
    { key: "age_40", label: "Aged 40 or over", test: (r) => r.age >= 40, needs: "age" },
    { key: "age_u18", label: "Aged under 18", test: (r) => r.age < 18, needs: "age" },
    { key: "grand_multi", label: "Five or more previous births", test: (r) => r.parity >= 5, needs: "parity" },
  ],
  admissions: [
    { key: "comorb3", label: "Three or more comorbidities", test: (r) => r.comorbidities >= 3, needs: "comorbidities" },
    { key: "age65", label: "Aged 65 or over", test: (r) => r.age >= 65, needs: "age" },
    { key: "selfpay", label: "Self-pay (uninsured)", test: (r) => r.payment === "Self-pay", needs: "payment" },
    { key: "longstay", label: "Stay longer than 10 days", test: (r) => r.length_of_stay > 10, needs: "length_of_stay" },
  ],
};

const TYPE_VAR = { maternal: "complication_type", admissions: "discharge_status" };

// ---------------------------------------------------------------------------
// Helpers

const varMeta = (ds, key) => DATASETS[ds].variables.find((v) => v.key === key);
const lower = (s) => s.toLowerCase();
const isMissing = (v) => v === null || v === undefined;
const plural = (n, word) => `${n.toLocaleString()} ${word}`;
const fx = (x, d = 1) => Number(x).toFixed(d);
const outcomeNoun = (meta) => lower(meta.label);
const rateNoun = (meta) => `${outcomeNoun(meta)} rate`;
const at = (group, level) => (["quarter", "month"].includes(group) ? `in ${level}` : `for ${level}`);

function levelsOf(ds, key, rows) {
  const meta = varMeta(ds, key);
  const present = new Set(rows.map((r) => r[key]).filter((v) => !isMissing(v)));
  const order = meta.order || [...present].sort();
  return order.filter((l) => present.has(l));
}

function sigPhrase(p) {
  return p < 0.05
    ? "The statistical test suggests this difference is unlikely to be due to random variation alone."
    : "The statistical test does not rule out random variation, so these differences should not be treated as a real pattern without more data.";
}

function strengthWord(v) {
  if (v < 0.1) return "very small";
  if (v < 0.2) return "small";
  if (v < 0.4) return "moderate";
  return "large";
}

function corrWord(r) {
  const a = Math.abs(r);
  if (a < 0.1) return "almost no";
  if (a < 0.3) return "a weak";
  if (a < 0.5) return "a moderate";
  return "a strong";
}

// Find variables mentioned in the text, longest synonym first, without overlaps.
function findVars(text, ds) {
  const t = ` ${lower(text).replace(/[?.,!]/g, " ")} `;
  const cands = [];
  for (const v of DATASETS[ds].variables) {
    for (const syn of [v.label, ...(v.synonyms || [])]) {
      const s = lower(syn);
      let idx = t.indexOf(s);
      while (idx !== -1) {
        const before = t[idx - 1];
        const after = t[idx + s.length];
        if (!/[a-z]/.test(before || " ") && !/[a-z]/.test(after || " ")) {
          cands.push({ key: v.key, start: idx, end: idx + s.length, len: s.length });
        }
        idx = t.indexOf(s, idx + 1);
      }
    }
  }
  cands.sort((a, b) => b.len - a.len);
  const taken = [];
  const out = [];
  for (const c of cands) {
    if (taken.some((x) => c.start < x.end && c.end > x.start)) continue;
    taken.push(c);
    out.push(c);
  }
  out.sort((a, b) => a.start - b.start);
  const keys = [];
  for (const c of out) if (!keys.includes(c.key)) keys.push(c.key);
  return keys;
}

// ---------------------------------------------------------------------------
// Question understanding

function detectIntent(t) {
  if (/\b(report|write[- ]?up|summari[sz]e (this|the|our) (analysis|conversation|findings))\b/.test(t)) return "report";
  if (/\bmissing|incomplete|completeness|data quality\b/.test(t)) return "missing";
  if (/\b(what|which) (variables|columns|fields|data)\b|\bdescribe (the |this )?dataset|\boverview of\b|\bwhat('s| is) in\b/.test(t)) return "overview";
  if (/responsible|\bwhy\b|driv(e|er|ing)|\bcaus|contribut|explain (the|this|that) (high|rise|increase|peak|spike)|risk factors?|factors|associated with/.test(t)) return "drivers";
  if (/\btrend|over time|month[- ]by[- ]month|monthly|over the year|each month|by month\b/.test(t)) return "trend";
  if (/relationship|correlat|\bversus\b|\bvs\.?\b|\bagainst\b|related to/.test(t)) return "correlation";
  if (/most common|most frequent|distribution|spread|histogram|\brange of\b|how (is|are) .* distributed|box ?plot|typical/.test(t)) return "distribution";
  if (/compare|comparison|across|\bby\b|between|differ|breakdown|break down|which .* (highest|lowest)|per /.test(t)) return "compare";
  return null;
}

export function plan(message, datasetIds, context = {}) {
  const t = lower(message);
  const selected = datasetIds && datasetIds.length ? datasetIds : [context.datasetId || "maternal"];

  // Pick the selected dataset whose variables the question mentions most.
  let ds = null;
  let mentioned = [];
  for (const id of selected) {
    const found = findVars(message, id);
    const score = found.filter((k) => !["quarter", "month"].includes(k)).length * 2 + found.length;
    if (!ds || score > mentioned.score) {
      ds = id;
      mentioned = Object.assign(found, { score });
    }
  }
  if (mentioned.score === 0 && context.datasetId && selected.includes(context.datasetId)) {
    ds = context.datasetId;
    mentioned = Object.assign(findVars(message, ds), { score: 0 });
  }
  const sameDs = context.datasetId === ds;

  const metas = mentioned.map((k) => varMeta(ds, k));
  const binaries = metas.filter((m) => m.type === "binary");
  const numerics = metas.filter((m) => m.type === "numeric");
  const cats = metas.filter((m) => m.type === "categorical");

  let intent = detectIntent(t);
  const isFollowUp = /^(and|what about|how about|now|also|then|instead|same|show|break)/.test(t.trim()) || /\b(it|that|this|those|these|the highest|the lowest|instead)\b/.test(t);

  // Outcome: explicitly named outcome > other binary > numeric > previous outcome.
  let outcome =
    binaries.find((m) => m.outcome)?.key ||
    (intent !== "drivers" ? binaries[0]?.key : null) ||
    (["compare", "trend", "distribution"].includes(intent) || !intent ? numerics[0]?.key : null) ||
    (sameDs ? context.outcome : null) ||
    DATASETS[ds].variables.find((v) => v.outcome)?.key;

  // Grouping: a categorical variable that isn't the outcome.
  let group = cats.find((m) => m.key !== outcome && m.key !== TYPE_VAR[ds])?.key || null;
  if (!group && intent === "compare" && binaries.length > 1) group = binaries.find((b) => b.key !== outcome)?.key;
  if (!group && (intent === "compare" || !intent) && sameDs && context.group && isFollowUp) group = context.group;

  if (group === "month" && intent === "compare") intent = "trend";

  if (!intent) {
    if (cats.length === 1 && !binaries.length && !numerics.length && !isFollowUp) intent = "distribution";
    else if (cats.length && outcome) intent = group === "month" ? "trend" : "compare";
    else if (numerics.length >= 2) intent = "correlation";
    else if (metas.length === 1 && (numerics.length || cats.length)) intent = "distribution";
    else if (isFollowUp && sameDs && context.intent) intent = context.intent;
  }

  if (intent === "compare" && !group) {
    if (numerics.length >= 2 || (numerics.length === 1 && binaries.length === 0 && mentioned.length >= 2)) intent = "correlation";
    else if (sameDs && context.group) group = context.group;
    else group = "quarter";
  }

  const highlight =
    intent === "drivers" && sameDs && context.highlight && /\b(highest|lowest|peak|that|this|it|worst|spike|increase|rise)\b/.test(t)
      ? context.highlight
      : null;
  // "what drove complications in Q3?" -> highlight the level named in the question
  let namedLevel = null;
  if (intent === "drivers") {
    for (const gk of ["quarter", "month", "ward", "department", "age_group"]) {
      const meta = varMeta(ds, gk);
      if (!meta) continue;
      const lvl = (meta.order || []).find((l) => new RegExp(`\\b${lower(l).replace(/[–]/g, ".")}\\b`).test(t));
      if (lvl) { namedLevel = { var: gk, level: lvl }; break; }
    }
  }

  return {
    intent: intent || "clarify",
    datasetId: ds,
    outcome,
    group,
    numerics: numerics.map((m) => m.key),
    mentioned: [...mentioned],
    highlight: namedLevel || highlight,
  };
}

// ---------------------------------------------------------------------------
// Analyses

function compareBinary(ds, outcome, group, rows) {
  const om = varMeta(ds, outcome);
  const gm = varMeta(ds, group);
  const unit = DATASETS[ds].unit;
  const valid = rows.filter((r) => !isMissing(r[outcome]) && !isMissing(r[group]));
  const levels = levelsOf(ds, group, valid);
  const stats = levels.map((l) => {
    const g = valid.filter((r) => r[group] === l);
    const k = g.filter((r) => r[outcome]).length;
    const [lo, hi] = wilson(k, g.length);
    return { level: l, n: g.length, k, rate: k / g.length, lo, hi };
  });
  const test = chiSquareTest(stats.map((s) => [s.k, s.n - s.k]));
  const sorted = [...stats].sort((a, b) => b.rate - a.rate);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const overallK = stats.reduce((s, x) => s + x.k, 0);
  const overall = overallK / valid.length;
  const rest = valid.filter((r) => r[group] !== top.level);
  const restK = rest.filter((r) => r[outcome]).length;
  const rr = riskRatio(top.k, top.n, restK, rest.length);
  const timeLike = group === "quarter";
  const sig = test.p < 0.05;
  const gName = lower(gm.label);

  const headline = sig
    ? `${top.level} had the highest ${rateNoun(om)} at ${pct(top.rate)}, clearly above other ${gName}s`
    : `No clear difference in ${rateNoun(om)} across ${gName}s`;

  const explanation = [
    `Across ${plural(valid.length, unit)}, ${pct(overall)} had a ${outcomeNoun(om)}. ` +
      `The rate was highest ${at(group, top.level)} (${top.k} of ${top.n}, ${pct(top.rate)}) and lowest ${at(group, bottom.level)} (${bottom.k} of ${bottom.n}, ${pct(bottom.rate)}).`,
    sig
      ? `${at(group, top.level)[0].toUpperCase() + at(group, top.level).slice(1)}, ${unit} were about ${fx(rr.rr, 1)} times as likely to have a ${outcomeNoun(om)} as in the other ${gName}s combined. ${sigPhrase(test.p)}`
      : sigPhrase(test.p),
  ];

  const interpretation = [];
  const gap = top.rate - bottom.rate;
  interpretation.push(
    `The gap between the highest and lowest ${gName} is ${fx(gap * 100)} percentage points, roughly ${Math.round(gap * 1000)} extra ${outcomeNoun(om)}s per 1,000 ${unit}.`
  );
  if (timeLike) {
    const seq = stats.map((s) => s.rate);
    const rising = seq.every((x, i) => i === 0 || x >= seq[i - 1]);
    const falling = seq.every((x, i) => i === 0 || x <= seq[i - 1]);
    interpretation.push(
      rising ? "The rate rose steadily through the year." :
      falling ? "The rate fell steadily through the year." :
      `The pattern is not a steady trend: ${top.level} stands out against the ${gName}s on either side of it, which points to something specific to that period rather than gradual change.`
    );
  }
  const overlap = stats.filter((s) => s.level !== top.level).every((s) => s.hi < top.lo);
  interpretation.push(
    overlap
      ? `The 95% confidence interval for ${top.level} does not overlap with any other ${gName}, which supports treating it as a genuine outlier.`
      : `Some confidence intervals overlap, so not every pairwise difference is reliable on its own; the overall test is the better guide.`
  );
  interpretation.push("This comparison describes differences; it does not on its own explain why they occurred.");

  const followUps = [
    sig ? `What was responsible for the highest rate in ${top.level}?` : `Which factors are associated with ${outcomeNoun(om)}s?`,
    group !== "age_group" && varMeta(ds, "age_group") ? `Compare ${rateNoun(om)}s by age group` : null,
    group !== "month" ? `Show the monthly trend in ${outcomeNoun(om)}s` : null,
    TYPE_VAR[ds] && ds === "maternal" ? `Which complication types were most common?` : null,
    `Generate a report of this analysis`,
  ].filter(Boolean);

  return {
    headline,
    explanation,
    evidence: [
      {
        kind: "chart",
        title: `${om.label} rate by ${gName}`,
        caption: `Bars show the percentage of ${unit} with a ${outcomeNoun(om)}. Whiskers show 95% confidence intervals.`,
        chart: {
          type: "bar",
          xKey: "level",
          data: stats.map((s) => ({ level: s.level, rate: r2(s.rate * 100, 1), error: [r2((s.rate - s.lo) * 100, 2), r2((s.hi - s.rate) * 100, 2)], n: s.n, k: s.k })),
          series: [{ key: "rate", label: `${om.label} rate` }],
          errorKey: "error",
          highlight: sig ? top.level : null,
          yUnit: "%",
          yLabel: `${om.label} rate (%)`,
          reference: { value: r2(overall * 100, 1), label: `Overall ${pct(overall)}` },
        },
      },
      {
        kind: "table",
        title: `${om.label} by ${gName}`,
        columns: [
          { key: "level", label: gm.label },
          { key: "n", label: DATASETS[ds].unit[0].toUpperCase() + DATASETS[ds].unit.slice(1), align: "right" },
          { key: "k", label: `With ${outcomeNoun(om)}`, align: "right" },
          { key: "rate", label: "Rate", align: "right" },
          { key: "ci", label: "95% CI", align: "right" },
        ],
        rows: stats.map((s) => ({ level: s.level, n: s.n.toLocaleString(), k: s.k.toLocaleString(), rate: pct(s.rate), ci: `${pct(s.lo)} – ${pct(s.hi)}`, _highlight: sig && s.level === top.level })),
      },
    ],
    interpretation,
    technical: {
      method: `Chi-square test of independence (${om.label} × ${gm.label}); Wilson score intervals for each rate; risk ratio for ${top.level} versus all other ${gName}s.`,
      results: [
        { label: "Sample size", value: `n = ${valid.length.toLocaleString()} (${rows.length - valid.length} excluded for missing values)` },
        { label: "Test statistic", value: `χ²(${test.df}) = ${fx(test.chi, 2)}` },
        { label: "P-value", value: fmtP(test.p) },
        { label: "Effect size", value: `Cramér's V = ${fx(test.cramersV, 3)} (${strengthWord(test.cramersV)})` },
        { label: `Risk ratio, ${top.level} vs rest`, value: `${fx(rr.rr, 2)} (95% CI ${fx(rr.ci[0], 2)} – ${fx(rr.ci[1], 2)}), p ${rr.p < 0.001 ? "< 0.001" : "= " + fmtP(rr.p)}` },
      ],
      assumptions: [
        "Each record is an independent observation (one row per " + unit.replace(/s$/, "") + ").",
        `All expected cell counts are at least 5 (smallest = ${fx(test.minExpected, 1)}).`,
      ],
      limitations: [
        "Rates are unadjusted: differences in patient mix between groups are not accounted for.",
        "The risk ratio compares the highest group with all others and was chosen after looking at the data, so its p-value is optimistic.",
        "Observational data: associations do not establish cause.",
      ],
    },
    followUps,
    context: { intent: "compare", outcome, group, highlight: { var: group, level: top.level, rate: top.rate } },
  };
}

function compareNumeric(ds, outcome, group, rows) {
  const om = varMeta(ds, outcome);
  const gm = varMeta(ds, group);
  const unit = DATASETS[ds].unit;
  const valid = rows.filter((r) => !isMissing(r[outcome]) && !isMissing(r[group]));
  const levels = levelsOf(ds, group, valid);
  const groups = levels.map((l) => valid.filter((r) => r[group] === l).map((r) => r[outcome]));
  const summ = levels.map((l, i) => {
    const g = groups[i];
    const fn = fiveNumber(g);
    return { level: l, n: g.length, mean: mean(g), sd: sd(g), ...fn };
  });
  const gName = lower(gm.label);
  const sorted = [...summ].sort((a, b) => b.mean - a.mean);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const u = om.unit ? ` ${om.unit}` : "";
  let testText, p, effect, df;
  if (levels.length === 2) {
    const w = welchT(groups[0], groups[1]);
    p = w.p;
    testText = `Welch's t(${fx(w.df, 1)}) = ${fx(w.t, 2)}`;
    effect = `Cohen's d = ${fx(w.cohensD, 2)}; mean difference ${fx(w.diff, 2)}${u} (95% CI ${fx(w.ci[0], 2)} – ${fx(w.ci[1], 2)})`;
    df = w.df;
  } else {
    const a = anova(groups);
    p = a.p;
    testText = `F(${a.d1}, ${a.d2}) = ${fx(a.f, 2)}`;
    effect = `η² = ${fx(a.etaSquared, 3)} (${fx(a.etaSquared * 100, 1)}% of variation explained by ${gName})`;
    df = a.d2;
  }
  const sig = p < 0.05;
  const most = om.unit === "days" ? "longest" : "highest";
  const headline2 = sig
    ? `${top.level} had the ${most} average ${lower(om.label)} at ${fx(top.mean, om.unit === "days" ? 1 : 2)}${u}`
    : `No clear difference in average ${lower(om.label)} across ${gName}s`;

  return {
    headline: headline2,
    explanation: [
      `Average ${lower(om.label)} ranged from ${fx(bottom.mean, 2)}${u} ${at(group, bottom.level)} to ${fx(top.mean, 2)}${u} ${at(group, top.level)}, across ${plural(valid.length, unit)}.`,
      sigPhrase(p),
    ],
    evidence: [
      {
        kind: "chart",
        title: `${om.label} by ${gName}`,
        caption: `Boxes show the middle half of ${unit}; the line inside is the median. Whiskers extend to the most extreme values within 1.5× the box height.`,
        chart: {
          type: "box",
          xKey: "level",
          data: summ.map((s) => ({ level: s.level, min: r2(s.min), q1: r2(s.q1), median: r2(s.median), q3: r2(s.q3), max: r2(s.max), mean: r2(s.mean), n: s.n })),
          yUnit: om.unit || "",
          yLabel: `${om.label}${om.unit ? ` (${om.unit})` : ""}`,
        },
      },
      {
        kind: "table",
        title: `Summary by ${gName}`,
        columns: [
          { key: "level", label: gm.label },
          { key: "n", label: "n", align: "right" },
          { key: "mean", label: "Mean", align: "right" },
          { key: "sd", label: "SD", align: "right" },
          { key: "median", label: "Median", align: "right" },
          { key: "iqr", label: "IQR", align: "right" },
        ],
        rows: summ.map((s) => ({ level: s.level, n: s.n.toLocaleString(), mean: fx(s.mean, 2), sd: fx(s.sd, 2), median: fx(s.median, 1), iqr: `${fx(s.q1, 1)} – ${fx(s.q3, 1)}` })),
      },
    ],
    interpretation: [
      `The difference between the highest and lowest ${gName} is ${fx(top.mean - bottom.mean, 2)}${u} on average.`,
      sig ? `Although the difference is statistically reliable, check the effect size in the technical details to judge whether it matters in practice.` : `Most of the variation is within ${gName}s rather than between them.`,
    ],
    technical: {
      method: levels.length === 2 ? "Welch's two-sample t-test (does not assume equal variances)." : "One-way analysis of variance (ANOVA).",
      results: [
        { label: "Sample size", value: `n = ${valid.length.toLocaleString()} (${rows.length - valid.length} excluded for missing values)` },
        { label: "Test statistic", value: testText },
        { label: "P-value", value: fmtP(p) },
        { label: "Effect size", value: effect },
      ],
      assumptions: [
        "Observations are independent.",
        levels.length === 2 ? "Approximately normal sampling distribution of the mean (reasonable with large groups)." : "Similar variance in each group; ANOVA is robust to modest violations with large, balanced groups.",
      ],
      limitations: ["Unadjusted comparison: patient mix differences are not accounted for.", "Skewed variables such as length of stay may be better summarised by medians."],
    },
    followUps: [
      `Show the distribution of ${lower(om.label)}`,
      group !== "month" ? `Show the monthly trend in ${lower(om.label)}` : null,
      `Generate a report of this analysis`,
    ].filter(Boolean),
    context: { intent: "compare", outcome, group, highlight: { var: group, level: top.level } },
  };
}

function trend(ds, outcome, rows) {
  const om = varMeta(ds, outcome);
  const unit = DATASETS[ds].unit;
  const months = varMeta(ds, "month").order;
  const valid = rows.filter((r) => !isMissing(r[outcome]));
  const binary = om.type === "binary";
  const points = months.map((m, i) => {
    const g = valid.filter((r) => r.month === m);
    if (binary) {
      const k = g.filter((r) => r[outcome]).length;
      const [lo, hi] = wilson(k, g.length);
      return { month: m, idx: i + 1, n: g.length, k, value: k / g.length, lo, hi };
    }
    const vals = g.map((r) => r[outcome]);
    return { month: m, idx: i + 1, n: g.length, value: mean(vals), lo: mean(vals) - 1.96 * sd(vals) / Math.sqrt(vals.length), hi: mean(vals) + 1.96 * sd(vals) / Math.sqrt(vals.length) };
  });

  // Linear trend: Cochran–Armitage for binary, regression on month for numeric.
  let trendStat, p, slopeText;
  if (binary) {
    const N = points.reduce((s, x) => s + x.n, 0);
    const K = points.reduce((s, x) => s + x.k, 0);
    const pbar = K / N;
    const tbar = points.reduce((s, x) => s + x.n * x.idx, 0) / N;
    const num = points.reduce((s, x) => s + x.idx * (x.k - x.n * pbar), 0);
    const varT = pbar * (1 - pbar) * points.reduce((s, x) => s + x.n * (x.idx - tbar) ** 2, 0);
    const z = num / Math.sqrt(varT);
    p = 2 * (1 - 0.5 * (1 + erfApprox(Math.abs(z) / Math.SQRT2)));
    trendStat = `Cochran–Armitage Z = ${fx(z, 2)}`;
    const pc = pearson(points.map((x) => x.idx), points.map((x) => x.value * 100));
    slopeText = `${pc.slope >= 0 ? "+" : ""}${fx(pc.slope, 2)} percentage points per month (unweighted)`;
  } else {
    const pc = pearson(valid.map((r) => r.month_index), valid.map((r) => r[outcome]));
    p = pc.p;
    trendStat = `Linear regression on month, t(${pc.df}) = ${fx(pc.t, 2)}`;
    slopeText = `${pc.slope >= 0 ? "+" : ""}${fx(pc.slope, 3)}${om.unit ? " " + om.unit : ""} per month`;
  }
  const peak = [...points].sort((a, b) => b.value - a.value)[0];
  const low = [...points].sort((a, b) => a.value - b.value)[0];
  const fmtV = (v) => (binary ? pct(v) : `${fx(v, 2)}${om.unit ? " " + om.unit : ""}`);
  const peakQuarter = `Q${Math.floor((peak.idx - 1) / 3) + 1}`;
  const steady = p >= 0.05;

  return {
    headline: `${binary ? om.label + " rate" : "Average " + lower(om.label)} peaked in ${peak.month} at ${fmtV(peak.value)}${steady ? ", with no steady year-long trend" : ""}`,
    explanation: [
      `Month by month, the ${binary ? rateNoun(om) : "average " + lower(om.label)} ranged from ${fmtV(low.value)} in ${low.month} to ${fmtV(peak.value)} in ${peak.month}.`,
      steady
        ? `There is no consistent upward or downward movement across the year. The changes look like a temporary rise rather than a lasting shift.`
        : `There is a consistent ${slopeText.startsWith("+") ? "upward" : "downward"} movement across the year that is unlikely to be due to random variation alone.`,
    ],
    evidence: [
      {
        kind: "chart",
        title: `Monthly ${binary ? lower(om.label) + " rate" : "average " + lower(om.label)}`,
        caption: `Shaded band shows the 95% confidence interval for each month.`,
        chart: {
          type: "line",
          xKey: "month",
          data: points.map((x) => ({
            month: x.month,
            value: r2(binary ? x.value * 100 : x.value, 2),
            band: [r2(binary ? x.lo * 100 : x.lo, 2), r2(binary ? x.hi * 100 : x.hi, 2)],
            n: x.n,
          })),
          series: [{ key: "value", label: binary ? `${om.label} rate` : `Average ${lower(om.label)}` }],
          bandKey: "band",
          yUnit: binary ? "%" : om.unit || "",
          yLabel: binary ? `${om.label} rate (%)` : `${om.label}${om.unit ? ` (${om.unit})` : ""}`,
          highlight: peak.month,
        },
      },
    ],
    interpretation: [
      `The highest months cluster in ${peakQuarter}, which suggests a period-specific cause worth investigating.`,
      `Monthly figures are based on about ${Math.round(mean(points.map((x) => x.n)))} ${unit} each, so single-month swings of a few percentage points can occur by chance.`,
    ],
    technical: {
      method: binary ? "Cochran–Armitage test for linear trend in proportions across months; Wilson intervals per month." : "Least-squares regression of the outcome on month number; t-based intervals per month.",
      results: [
        { label: "Sample size", value: `n = ${valid.length.toLocaleString()}, 12 months` },
        { label: "Test statistic", value: trendStat },
        { label: "P-value (linear trend)", value: fmtP(p) },
        { label: "Slope", value: slopeText },
      ],
      assumptions: ["The trend test looks only for a straight-line change; it will not detect a rise followed by a fall."],
      limitations: ["Seasonal effects cannot be separated from one-off events with a single year of data."],
    },
    followUps: [
      `What was responsible for the peak in ${peakQuarter}?`,
      `Compare ${binary ? rateNoun(om) + "s" : lower(om.label)} across the four quarters`,
      `Generate a report of this analysis`,
    ],
    context: { intent: "trend", outcome, group: "month", highlight: { var: "quarter", level: peakQuarter } },
  };
}

function erfApprox(x) {
  const t = 1 / (1 + 0.3275911 * x);
  return 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
}

function drivers(ds, outcome, highlight, rows) {
  const om = varMeta(ds, outcome);
  const unit = DATASETS[ds].unit;
  const factors = (FACTORS[ds] || []).filter((f) => f.needs !== outcome);
  const valid = rows.filter((r) => !isMissing(r[outcome]));

  if (!highlight) {
    // Screen factors across the whole dataset.
    const res = factors.map((f) => {
      const v = valid.filter((r) => !isMissing(r[f.needs]));
      const ex = v.filter((r) => f.test(r));
      const un = v.filter((r) => !f.test(r));
      const a = ex.filter((r) => r[outcome]).length;
      const c = un.filter((r) => r[outcome]).length;
      return { ...f, n: v.length, nEx: ex.length, ...riskRatio(a, ex.length, c, un.length) };
    });
    const adj = holm(res.map((r) => r.p));
    res.forEach((r, i) => (r.pAdj = adj[i]));
    res.sort((a, b) => b.rr - a.rr);
    const strong = res.filter((r) => r.pAdj < 0.05 && r.rr > 1);
    return {
      headline: strong.length
        ? `${strong[0].label} is the factor most strongly associated with ${outcomeNoun(om)}s`
        : `No single factor shows a clear association with ${outcomeNoun(om)}s`,
      explanation: [
        strong.length
          ? `${unit[0].toUpperCase() + unit.slice(1)} with ${lower(strong[0].label)} had a ${outcomeNoun(om)} rate of ${pct(strong[0].r1)}, compared with ${pct(strong[0].r0)} for those without, about ${fx(strong[0].rr, 1)} times as high.`
          : `None of the screened factors showed a difference that holds up after accounting for testing several factors at once.`,
        strong.length > 1 ? `${strong.slice(1).map((s) => s.label).join(", ")} ${strong.length > 2 ? "are" : "is"} also associated with higher rates.` : "",
      ].filter(Boolean),
      evidence: [
        {
          kind: "chart",
          title: `${om.label} rate with and without each factor`,
          caption: "Each pair compares the rate among patients with the factor to those without it.",
          chart: {
            type: "hbar",
            xKey: "label",
            data: res.map((r) => ({ label: r.label, with: r2(r.r1 * 100, 1), without: r2(r.r0 * 100, 1) })),
            series: [{ key: "with", label: "With factor" }, { key: "without", label: "Without factor" }],
            yUnit: "%",
            yLabel: `${om.label} rate (%)`,
          },
        },
        {
          kind: "table",
          title: "Factor screen",
          columns: [
            { key: "label", label: "Factor" },
            { key: "prev", label: "Prevalence", align: "right" },
            { key: "rr", label: "Risk ratio", align: "right" },
            { key: "ci", label: "95% CI", align: "right" },
            { key: "p", label: "Adj. p", align: "right" },
          ],
          rows: res.map((r) => ({ label: r.label, prev: pct(r.nEx / r.n), rr: fx(r.rr, 2), ci: `${fx(r.ci[0], 2)} – ${fx(r.ci[1], 2)}`, p: fmtP(r.pAdj), _highlight: r.pAdj < 0.05 && r.rr > 1 })),
        },
      ],
      interpretation: [
        "Each factor is examined on its own. Factors often occur together (for example, older age and hypertension), so their effects overlap and should not be added up.",
        "These are associations in routine data, not proof that a factor causes the outcome.",
      ],
      technical: {
        method: "Univariable risk ratios with log-method 95% confidence intervals; Holm–Bonferroni adjustment across factors.",
        results: [
          { label: "Sample size", value: `n = ${valid.length.toLocaleString()}` },
          { label: "Factors screened", value: String(res.length) },
          ...res.slice(0, 4).map((r) => ({ label: r.label, value: `RR ${fx(r.rr, 2)} (${fx(r.ci[0], 2)} – ${fx(r.ci[1], 2)}), adj. p ${fmtP(r.pAdj)}` })),
        ],
        assumptions: ["Independent observations.", "Thresholds (for example, fewer than 4 antenatal visits) follow common clinical cut-offs."],
        limitations: ["Unadjusted for confounding; a multivariable model would be needed to separate overlapping factors.", "Records with missing factor values are excluded for that factor only."],
      },
      followUps: [
        `Compare ${rateNoun(om)}s across the four quarters`,
        `Examine missing data`,
        `Generate a report of this analysis`,
      ],
      context: { intent: "drivers", outcome, group: null, highlight: null },
    };
  }

  // Explain why one group (for example Q3) had a higher rate than the others.
  const hv = highlight.var;
  const hl = highlight.level;
  const inG = valid.filter((r) => r[hv] === hl);
  const outG = valid.filter((r) => r[hv] !== hl);
  const rateIn = inG.filter((r) => r[outcome]).length / inG.length;
  const rateOut = outG.filter((r) => r[outcome]).length / outG.length;
  const gap = rateIn - rateOut;

  const res = factors.map((f) => {
    const vIn = inG.filter((r) => !isMissing(r[f.needs]));
    const vOut = outG.filter((r) => !isMissing(r[f.needs]));
    const exIn = vIn.filter((r) => f.test(r)).length;
    const exOut = vOut.filter((r) => f.test(r)).length;
    const prevIn = exIn / vIn.length;
    const prevOut = exOut / vOut.length;
    const prevTest = twoPropZ(exIn, vIn.length, exOut, vOut.length);
    // Association with outcome across all records
    const all = valid.filter((r) => !isMissing(r[f.needs]));
    const ex = all.filter((r) => f.test(r));
    const un = all.filter((r) => !f.test(r));
    const assoc = riskRatio(ex.filter((r) => r[outcome]).length, ex.length, un.filter((r) => r[outcome]).length, un.length);
    // Standardisation: the highlighted group's rate if factor prevalence matched the other groups.
    const rIn1 = vIn.filter((r) => f.test(r) && r[outcome]).length / Math.max(exIn, 1);
    const rIn0 = vIn.filter((r) => !f.test(r) && r[outcome]).length / Math.max(vIn.length - exIn, 1);
    const actual = prevIn * rIn1 + (1 - prevIn) * rIn0;
    const standardised = prevOut * rIn1 + (1 - prevOut) * rIn0;
    return { ...f, prevIn, prevOut, prevP: prevTest.p, rr: assoc.rr, rrCi: assoc.ci, rrP: assoc.p, explained: actual - standardised };
  });
  const prevAdj = holm(res.map((r) => r.prevP));
  const rrAdj = holm(res.map((r) => r.rrP));
  res.forEach((r, i) => { r.prevPAdj = prevAdj[i]; r.rrPAdj = rrAdj[i]; });
  const contributors = res
    .filter((r) => r.prevPAdj < 0.05 && r.prevIn > r.prevOut && r.rrPAdj < 0.05 && r.rr > 1)
    .sort((a, b) => b.explained - a.explained);
  const ordered = [...res].sort((a, b) => b.explained - a.explained);

  // Which complication types made up the excess?
  const tv = TYPE_VAR[ds];
  let typeEvidence = null;
  let typeLine = null;
  if (tv && ds === "maternal") {
    const types = [...new Set(valid.map((r) => r[tv]).filter((t) => t !== "None"))];
    const typeRows = types
      .map((t) => ({
        type: t,
        inRate: inG.filter((r) => r[tv] === t).length / inG.length,
        outRate: outG.filter((r) => r[tv] === t).length / outG.length,
      }))
      .sort((a, b) => (b.inRate - b.outRate) - (a.inRate - a.outRate));
    typeLine = `Most of the extra cases were ${lower(typeRows[0].type)} (${pct(typeRows[0].inRate)} of ${unit} in ${hl} versus ${pct(typeRows[0].outRate)} elsewhere).`;
    typeEvidence = {
      kind: "chart",
      title: `Complication types: ${hl} compared with the rest of the year`,
      caption: `Percentage of all ${unit} with each complication type.`,
      chart: {
        type: "hbar",
        xKey: "type",
        data: typeRows.map((t) => ({ type: t.type, inG: r2(t.inRate * 100, 1), outG: r2(t.outRate * 100, 1) })),
        series: [{ key: "inG", label: hl }, { key: "outG", label: "Rest of year" }],
        yUnit: "%",
        yLabel: `% of ${unit}`,
      },
    };
  }

  const gm = varMeta(ds, hv);
  const others = hv === "quarter" ? "the other three quarters" : `other ${lower(gm.label)}s`;
  const headline = contributors.length
    ? `The higher rate in ${hl} is most closely linked to ${contributors.slice(0, 2).map((c) => lower(c.label)).join(" and ")}`
    : `No single factor clearly explains the higher rate in ${hl}`;

  return {
    headline,
    explanation: [
      `In ${hl}, ${pct(rateIn)} of ${unit} had a ${outcomeNoun(om)}, compared with ${pct(rateOut)} across ${others}, a gap of ${fx(gap * 100)} percentage points.`,
      contributors.length
        ? `${contributors.map((c) => `${c.label} was more common in ${hl} (${pct(c.prevIn)} vs ${pct(c.prevOut)})`).join("; ")}. Each of these is linked to a higher chance of ${outcomeNoun(om)}s, so a shift in the patient mix accounts for part of the increase.`
        : `The patient characteristics we checked were similar in ${hl} and ${others}, so the difference may reflect factors not recorded in this dataset.`,
      typeLine,
    ].filter(Boolean),
    evidence: [
      {
        kind: "chart",
        title: `Share of the ${fx(gap * 100)}-point gap linked to each factor`,
        caption: `How much lower the ${hl} rate would be if each factor had been as common as in ${others}. Factors overlap, so the bars should not be added together.`,
        chart: {
          type: "hbar",
          xKey: "label",
          data: ordered.map((r) => ({ label: r.label, explained: r2(r.explained * 100, 2) })),
          series: [{ key: "explained", label: "Percentage points of the gap" }],
          highlightKeys: contributors.map((c) => c.label),
          yUnit: " pts",
          yLabel: "Percentage points",
        },
      },
      typeEvidence,
      {
        kind: "table",
        title: `Patient mix in ${hl} versus ${others}`,
        columns: [
          { key: "label", label: "Factor" },
          { key: "prevIn", label: hl, align: "right" },
          { key: "prevOut", label: "Others", align: "right" },
          { key: "rr", label: "Risk ratio", align: "right" },
          { key: "explained", label: "Gap linked", align: "right" },
        ],
        rows: ordered.map((r) => ({
          label: r.label,
          prevIn: pct(r.prevIn),
          prevOut: pct(r.prevOut),
          rr: `${fx(r.rr, 2)}`,
          explained: `${fx(r.explained * 100, 1)} pts`,
          _highlight: contributors.includes(r),
        })),
      },
    ].filter(Boolean),
    interpretation: [
      contributors.length
        ? `The data point to a change in who was admitted and the care they received before delivery, rather than a change in outcomes for similar patients.`
        : `When patient characteristics don't explain a difference, staffing, referral patterns and recording practices are worth reviewing.`,
      contributors.some((c) => c.key === "low_anc")
        ? `Fewer antenatal visits is a service factor that the hospital can act on, unlike age or parity. It is worth checking clinic staffing and attendance for this period.`
        : null,
      `The size of each factor's link is estimated one factor at a time. A multivariable model would be needed to separate the overlapping effects, and none of this proves cause.`,
    ].filter(Boolean),
    technical: {
      method: `For each factor: two-proportion z-test comparing prevalence in ${hl} with ${others}; univariable risk ratio for the outcome across all records; direct standardisation of the ${hl} rate to the other groups' factor prevalence to estimate the portion of the gap linked to that factor. Holm–Bonferroni adjustment across factors for both tests.`,
      results: [
        { label: "Sample size", value: `${hl}: n = ${inG.length.toLocaleString()}; others: n = ${outG.length.toLocaleString()}` },
        { label: "Rate gap", value: `${pct(rateIn)} vs ${pct(rateOut)} (${fx(gap * 100, 1)} percentage points)` },
        ...ordered.slice(0, 4).map((r) => ({
          label: r.label,
          value: `prevalence ${pct(r.prevIn)} vs ${pct(r.prevOut)} (adj. p ${fmtP(r.prevPAdj)}); RR ${fx(r.rr, 2)} (95% CI ${fx(r.rrCi[0], 2)} – ${fx(r.rrCi[1], 2)}, adj. p ${fmtP(r.rrPAdj)})`,
        })),
      ],
      assumptions: [
        "Within-group outcome rates for each factor are assumed to stay the same when prevalence is standardised.",
        "Independent observations.",
      ],
      limitations: [
        "Factors are examined one at a time and overlap; the portions of the gap are not additive.",
        "Only recorded variables can be assessed. Staffing, referral pathways and data-recording changes are not in this dataset.",
        "Association is not causation.",
      ],
    },
    followUps: [
      contributors.some((c) => c.key === "low_anc") ? `Compare antenatal visits across the four quarters` : `Identify variables associated with ${outcomeNoun(om)}s`,
      contributors.some((c) => c.key === "hypertension") ? `Compare ${rateNoun(om)}s for patients with and without hypertension by quarter` : null,
      `Show the monthly trend in ${outcomeNoun(om)}s`,
      `Generate a detailed research report`,
    ].filter(Boolean),
    context: { intent: "drivers", outcome, group: hv, highlight },
  };
}

function correlation(ds, xKey, yKey, rows) {
  const xm = varMeta(ds, xKey);
  const ym = varMeta(ds, yKey);
  const valid = rows.filter((r) => !isMissing(r[xKey]) && !isMissing(r[yKey]));
  const x = valid.map((r) => r[xKey]);
  const y = valid.map((r) => r[yKey]);
  const pc = pearson(x, y);
  const sig = pc.p < 0.05;
  const step = Math.max(1, Math.floor(valid.length / 500));
  const pts = valid.filter((_, i) => i % step === 0).map((r) => ({ x: r[xKey], y: r[yKey] }));
  const xs = [Math.min(...x), Math.max(...x)];
  const dir = pc.r > 0 ? "increase together" : "move in opposite directions";
  const ux = xm.unit ? ` ${xm.unit}` : "";
  const uy = ym.unit ? ` ${ym.unit}` : "";
  return {
    headline: !sig
      ? `No clear relationship between ${lower(xm.label)} and ${lower(ym.label)}`
      : Math.abs(pc.r) >= 0.1
      ? `${xm.label} and ${lower(ym.label)} tend to ${dir}, with ${corrWord(pc.r).replace(/^a /, "")} relationship`
      : `${xm.label} and ${lower(ym.label)} have a detectable but very weak relationship`,
    explanation: [
      sig && Math.abs(pc.r) >= 0.1
        ? `As ${lower(xm.label)} increases, ${lower(ym.label)} tends to ${pc.r > 0 ? "increase" : "decrease"}: each additional ${xm.unit ? xm.unit.replace(/s$/, "") : "unit"} is associated with a change of about ${fx(pc.slope, 3)}${uy}.`
        : sig
        ? `${xm.label} and ${lower(ym.label)} move together only slightly; knowing one tells you very little about the other.`
        : `${xm.label} does not reliably predict ${lower(ym.label)} in this data.`,
      sig
        ? `The statistical test suggests the relationship is unlikely to be due to random variation alone${Math.abs(pc.r) < 0.1 ? ", but with a large sample even tiny relationships become detectable, so this one is unlikely to matter in practice" : ""}. It does not show that one causes the other.`
        : `The statistical test does not rule out that any pattern here is due to chance.`,
    ],
    evidence: [
      {
        kind: "chart",
        title: `${ym.label} against ${lower(xm.label)}`,
        caption: `Each point is one ${DATASETS[ds].unit.replace(/s$/, "")}${step > 1 ? ` (a sample of ${pts.length} shown for readability)` : ""}. The line shows the overall linear trend.`,
        chart: {
          type: "scatter",
          data: pts,
          xLabel: `${xm.label}${ux ? ` (${xm.unit})` : ""}`,
          yLabel: `${ym.label}${uy ? ` (${ym.unit})` : ""}`,
          trend: xs.map((v) => ({ x: v, y: r2(pc.intercept + pc.slope * v, 3) })),
        },
      },
    ],
    interpretation: [
      `The correlation is ${corrWord(pc.r).replace(/^a /, "")}: ${lower(xm.label)} explains about ${fx(pc.r * pc.r * 100, 1)}% of the variation in ${lower(ym.label)}.`,
      "Other factors may influence both variables, so this relationship should not be read as cause and effect.",
    ],
    technical: {
      method: "Pearson product-moment correlation with Fisher z-transformed 95% confidence interval; ordinary least-squares line for display.",
      results: [
        { label: "Sample size", value: `n = ${valid.length.toLocaleString()}` },
        { label: "Correlation", value: `r = ${fx(pc.r, 3)} (95% CI ${fx(pc.ci[0], 3)} – ${fx(pc.ci[1], 3)})` },
        { label: "Test statistic", value: `t(${pc.df}) = ${fx(pc.t, 2)}` },
        { label: "P-value", value: fmtP(pc.p) },
        { label: "Slope", value: `${fx(pc.slope, 4)}${uy} per ${xm.unit ? xm.unit.replace(/s$/, "") : "unit"}` },
      ],
      assumptions: ["The relationship is approximately linear.", "No extreme outliers drive the result.", "Independent observations."],
      limitations: ["Correlation does not imply causation.", "Pearson's r captures only linear relationships."],
    },
    followUps: [`Show the distribution of ${lower(ym.label)}`, `Identify variables associated with complications`, `Generate a report of this analysis`],
    context: { intent: "correlation", outcome: yKey, group: null, highlight: null, x: xKey },
  };
}

function distribution(ds, key, rows) {
  const m = varMeta(ds, key);
  const unit = DATASETS[ds].unit;
  const valid = rows.filter((r) => !isMissing(r[key]));
  if (m.type !== "numeric") {
    const levels = levelsOf(ds, key, valid).filter((l) => l !== "None" || key !== "complication_type");
    const base = key === "complication_type" ? valid.filter((r) => r[key] !== "None") : valid;
    const counts = levels.map((l) => ({ level: String(l), n: base.filter((r) => r[key] === l).length }));
    counts.sort((a, b) => (m.order ? 0 : b.n - a.n));
    const top = [...counts].sort((a, b) => b.n - a.n)[0];
    return {
      headline: `${top.level} was the most common ${lower(m.label)}, at ${pct(top.n / base.length)}`,
      explanation: [`Of ${plural(base.length, key === "complication_type" ? "complications" : unit)}, ${top.n.toLocaleString()} were ${lower(top.level)}.`],
      evidence: [
        {
          kind: "chart",
          title: `${m.label}`,
          caption: `Number of ${key === "complication_type" ? "complications" : unit} in each category.`,
          chart: { type: "bar", xKey: "level", data: counts.map((c) => ({ level: c.level, count: c.n, share: r2((c.n / base.length) * 100, 1) })), series: [{ key: "count", label: "Count" }], yUnit: "", yLabel: "Count", highlight: top.level },
        },
      ],
      interpretation: [`The remaining categories account for ${pct(1 - top.n / base.length)} together.`],
      technical: {
        method: "Frequency counts.",
        results: [{ label: "Sample size", value: `n = ${base.length.toLocaleString()}` }, ...counts.map((c) => ({ label: c.level, value: `${c.n} (${pct(c.n / base.length)})` }))],
        assumptions: [],
        limitations: ["Descriptive only; no test of differences is performed."],
      },
      followUps: [key === "complication_type" ? "Compare maternal complication rates across the four quarters" : `Compare outcomes by ${lower(m.label)}`, "Generate a report of this analysis"],
      context: { intent: "distribution", outcome: key, group: null, highlight: null },
    };
  }
  const vals = valid.map((r) => r[key]);
  const fn = fiveNumber(vals);
  const mu = mean(vals);
  const s = sd(vals);
  const skew = vals.reduce((a, x) => a + ((x - mu) / s) ** 3, 0) / vals.length;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const isInt = vals.every((v) => Number.isInteger(v));
  const binCount = isInt && hi - lo <= 25 ? hi - lo + 1 : Math.min(24, Math.ceil(Math.log2(vals.length) + 1) * 2);
  const width = isInt && hi - lo <= 25 ? 1 : (hi - lo) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => {
    const a = lo + i * width;
    const b = a + width;
    const n = vals.filter((v) => (i === binCount - 1 ? v >= a && v <= b : v >= a && v < b)).length;
    return { bin: isInt && width === 1 ? String(a) : `${fx(a, 1)}–${fx(b, 1)}`, n };
  });
  const u = m.unit ? ` ${m.unit}` : "";
  const shape = Math.abs(skew) < 0.5 ? "roughly symmetrical" : skew > 0 ? "skewed to the right, with a tail of higher values" : "skewed to the left, with a tail of lower values";
  return {
    headline: `Typical ${lower(m.label)} is ${fx(fn.median, isInt ? 0 : 1)}${u}, with half of ${unit} between ${fx(fn.q1, 1)} and ${fx(fn.q3, 1)}${u}`,
    explanation: [
      `The distribution is ${shape}. The average is ${fx(mu, 2)}${u} and values range from ${fx(lo, 1)} to ${fx(hi, 1)}${u}.`,
      fn.outliers ? `${fn.outliers} ${unit} (${pct(fn.outliers / vals.length)}) have unusually high or low values.` : `There are no unusually extreme values.`,
    ],
    evidence: [
      {
        kind: "chart",
        title: `Distribution of ${lower(m.label)}`,
        caption: `Number of ${unit} in each range${m.unit ? ` (${m.unit})` : ""}.`,
        chart: { type: "histogram", xKey: "bin", data: bins, series: [{ key: "n", label: unit[0].toUpperCase() + unit.slice(1) }], yUnit: "", yLabel: "Count", xLabel: `${m.label}${m.unit ? ` (${m.unit})` : ""}` },
      },
      {
        kind: "stats",
        items: [
          { label: "Median", value: `${fx(fn.median, isInt ? 0 : 2)}${u}` },
          { label: "Mean", value: `${fx(mu, 2)}${u}` },
          { label: "Middle 50%", value: `${fx(fn.q1, 1)} – ${fx(fn.q3, 1)}` },
          { label: "Missing", value: `${rows.length - valid.length}` },
        ],
      },
    ],
    interpretation: [
      Math.abs(skew) >= 0.5 ? "Because the data are skewed, the median is a better summary than the mean." : "Because the data are fairly symmetrical, the mean and median tell a similar story.",
    ],
    technical: {
      method: "Descriptive statistics; Tukey fences (1.5 × IQR) for outliers.",
      results: [
        { label: "Sample size", value: `n = ${vals.length.toLocaleString()} (${rows.length - valid.length} missing)` },
        { label: "Mean (SD)", value: `${fx(mu, 3)} (${fx(s, 3)})` },
        { label: "Median [IQR]", value: `${fx(fn.median, 2)} [${fx(fn.q1, 2)} – ${fx(fn.q3, 2)}]` },
        { label: "Skewness", value: fx(skew, 3) },
        { label: "5th / 95th percentile", value: `${fx(quantile(vals, 0.05), 2)} / ${fx(quantile(vals, 0.95), 2)}` },
      ],
      assumptions: [],
      limitations: ["Descriptive only."],
    },
    followUps: [`Compare ${lower(m.label)} across the four quarters`, `Show the monthly trend in ${lower(m.label)}`, "Generate a report of this analysis"],
    context: { intent: "distribution", outcome: key, group: null, highlight: null },
  };
}

function missingData(ds, rows) {
  const d = DATASETS[ds];
  const vars = d.variables.filter((v) => v.type !== "id");
  const res = vars.map((v) => {
    const miss = rows.filter((r) => isMissing(r[v.key])).length;
    return { label: v.label, key: v.key, miss, share: miss / rows.length };
  }).sort((a, b) => b.share - a.share);
  const withMissing = res.filter((r) => r.miss > 0);
  const outcome = d.variables.find((v) => v.outcome);
  // Is missingness related to the outcome?
  const checks = withMissing.map((w) => {
    const m1 = rows.filter((r) => isMissing(r[w.key]));
    const m0 = rows.filter((r) => !isMissing(r[w.key]));
    const t = chiSquareTest([
      [m1.filter((r) => r[outcome.key]).length, m1.filter((r) => !r[outcome.key]).length],
      [m0.filter((r) => r[outcome.key]).length, m0.filter((r) => !r[outcome.key]).length],
    ]);
    return { ...w, p: t.p, rateMissing: m1.filter((r) => r[outcome.key]).length / m1.length, rateRecorded: m0.filter((r) => r[outcome.key]).length / m0.length };
  });
  return {
    headline: withMissing.length
      ? `${withMissing.length} of ${vars.length} variables have missing values, all below ${pct(Math.ceil(withMissing[0].share * 100) / 100, 0)}`
      : "No missing values in this dataset",
    explanation: [
      withMissing.length
        ? `${withMissing.map((w) => `${w.label} is missing for ${w.miss} ${d.unit} (${pct(w.share)})`).join("; ")}. All other variables are complete.`
        : "Every variable is recorded for every record.",
      checks.length && checks.every((c) => c.p >= 0.05)
        ? `Records with missing values have similar ${lower(outcome.label)} rates to complete records, so the gaps are unlikely to bias the main results.`
        : checks.some((c) => c.p < 0.05)
        ? `Missing values are more common among some patients, which could bias results that use those variables.`
        : "",
    ].filter(Boolean),
    evidence: [
      {
        kind: "chart",
        title: "Missing values by variable",
        caption: `Percentage of ${d.unit} with no value recorded.`,
        chart: { type: "hbar", xKey: "label", data: res.map((r) => ({ label: r.label, share: r2(r.share * 100, 2) })), series: [{ key: "share", label: "Missing" }], yUnit: "%", yLabel: "% missing" },
      },
    ],
    interpretation: [
      "Low levels of missing data (under 5–10%) rarely change conclusions, provided the gaps are not linked to the outcome.",
      "Analyses in Hosptic exclude missing values only for the variables involved in each question.",
    ],
    technical: {
      method: `Counts of missing values; chi-square test of whether ${lower(outcome.label)} differs between records with and without each missing variable.`,
      results: [
        { label: "Records", value: rows.length.toLocaleString() },
        ...checks.map((c) => ({ label: `${c.label}: outcome rate missing vs recorded`, value: `${pct(c.rateMissing)} vs ${pct(c.rateRecorded)}, p = ${fmtP(c.p)}` })),
      ],
      assumptions: ["A non-significant test is consistent with, but does not prove, data missing completely at random."],
      limitations: ["Missingness may still depend on unrecorded factors."],
    },
    followUps: ["Compare maternal complication rates across the four quarters", "Show the distribution of haemoglobin", "Generate a report of this analysis"].filter((f) => ds === "maternal" || !/maternal|haemoglobin/.test(f)),
    context: { intent: "missing", outcome: null, group: null, highlight: null },
  };
}

function overview(ds, rows) {
  const d = DATASETS[ds];
  const vars = d.variables.filter((v) => v.type !== "id");
  const typeLabel = { numeric: "Number", binary: "Yes / no", categorical: "Category", date: "Date" };
  return {
    headline: `${d.name} contains ${plural(rows.length, d.unit)} and ${vars.length} variables`,
    explanation: [d.description, `You can ask about any of the variables below, compare them across groups, or look at how they change over the year.`],
    evidence: [
      {
        kind: "table",
        title: "Variables",
        columns: [{ key: "label", label: "Variable" }, { key: "type", label: "Type" }, { key: "unit", label: "Unit" }, { key: "missing", label: "Missing", align: "right" }],
        rows: vars.map((v) => ({ label: v.label, type: typeLabel[v.type], unit: v.unit || "—", missing: rows.filter((r) => isMissing(r[v.key])).length.toLocaleString() })),
      },
    ],
    interpretation: [],
    technical: { method: "Dataset metadata.", results: [{ label: "Source", value: d.source }, { label: "Last updated", value: d.updated }], assumptions: [], limitations: [] },
    followUps: ds === "maternal"
      ? ["Compare maternal complication rates across the four quarters", "Show the distribution of birth weight", "Examine missing data"]
      : ["Compare readmission rates by department", "Show the monthly trend in length of stay", "Examine missing data"],
    context: { intent: "overview", outcome: null, group: null, highlight: null },
  };
}

function clarify(ds) {
  const d = DATASETS[ds];
  return {
    type: "clarify",
    headline: "I couldn't match that to an analysis yet",
    explanation: [
      `I can compare rates and averages across groups, show trends over the year, look at distributions and relationships between variables, examine missing data, and look for factors behind a result. Try naming a variable from ${d.name}, such as ${d.variables.filter((v) => v.type !== "id" && v.type !== "date").slice(4, 7).map((v) => lower(v.label)).join(", ")}.`,
    ],
    evidence: [],
    interpretation: [],
    technical: null,
    followUps: ds === "maternal"
      ? ["Compare maternal complication rates across the four quarters", "What variables are in this dataset?", "Show the distribution of length of stay"]
      : ["Compare readmission rates by department", "What variables are in this dataset?", "Show the distribution of length of stay"],
    context: {},
  };
}

function report(history, ds) {
  const analyses = (history || []).filter((h) => h && h.type === "analysis");
  if (!analyses.length) {
    return {
      type: "clarify",
      headline: "There are no analyses in this conversation to report on yet",
      explanation: ["Run at least one analysis, then ask for a report and I'll compile the findings, evidence and methods into a single document."],
      evidence: [], interpretation: [], technical: null,
      followUps: ["Compare maternal complication rates across the four quarters"],
      context: {},
    };
  }
  return {
    type: "report",
    headline: `Report ready: ${analyses.length} ${analyses.length === 1 ? "analysis" : "analyses"} from this conversation`,
    explanation: [
      "The report brings together each finding, its explanation and supporting evidence, followed by the methods and limitations. You can save it from the Reports page or download it now.",
    ],
    report: {
      title: analyses[0].headline,
      dataset: DATASETS[ds].name,
      created: new Date().toISOString(),
      sections: analyses.map((a) => ({
        question: a.question,
        headline: a.headline,
        explanation: a.explanation,
        interpretation: a.interpretation,
        evidence: a.evidence,
        technical: a.technical,
      })),
    },
    evidence: [],
    interpretation: [],
    technical: null,
    followUps: ["Examine missing data", "Compare outcomes by age group"],
    context: {},
  };
}

// ---------------------------------------------------------------------------

export function analyze({ message, datasetIds, context = {}, history = [] }) {
  const p = plan(message, datasetIds, context);
  const ds = p.datasetId;
  const rows = loadRows(ds);
  let out;

  try {
    switch (p.intent) {
      case "report":
        out = report(history, ds);
        break;
      case "missing":
        out = missingData(ds, rows);
        break;
      case "overview":
        out = overview(ds, rows);
        break;
      case "drivers": {
        const outcome = varMeta(ds, p.outcome)?.type === "binary" ? p.outcome : DATASETS[ds].variables.find((v) => v.outcome).key;
        out = drivers(ds, outcome, p.highlight, rows);
        break;
      }
      case "trend":
        out = trend(ds, p.numerics.length && !p.mentioned.some((k) => varMeta(ds, k).type === "binary") ? p.numerics[0] : p.outcome, rows);
        break;
      case "correlation": {
        const [x, y] = p.numerics.length >= 2 ? p.numerics : [p.numerics[0], context.outcome];
        out = x && y && varMeta(ds, y)?.type === "numeric" ? correlation(ds, x, y, rows) : clarify(ds);
        break;
      }
      case "distribution": {
        const key = p.mentioned.find((k) => !["quarter", "month"].includes(k)) || p.outcome;
        out = distribution(ds, key, rows);
        break;
      }
      case "compare": {
        const om = varMeta(ds, p.outcome);
        if (!om || !p.group) out = clarify(ds);
        else if (om.type === "binary") out = compareBinary(ds, p.outcome, p.group, rows);
        else if (om.type === "numeric") out = compareNumeric(ds, p.outcome, p.group, rows);
        else out = distribution(ds, p.outcome, rows);
        break;
      }
      default:
        out = clarify(ds);
    }
  } catch (err) {
    console.error(err);
    out = { ...clarify(ds), headline: "That analysis couldn't be completed", explanation: ["Something in the data prevented this calculation. Try rephrasing or choosing different variables."] };
  }

  return {
    type: out.type || "analysis",
    question: message,
    dataset: { id: ds, name: DATASETS[ds].name },
    ...out,
    evidence: (out.evidence || []).filter(Boolean),
    context: { ...context, ...out.context, datasetId: ds },
  };
}
