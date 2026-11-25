// Runs a validated plan against a dataset table and returns methodology,
// results, assumption checks, limitations and chart data. All numbers come
// from analytics/statistics.js.
const S = require("./statistics");
const { isMissing, toNumber, TRUE_WORDS, FALSE_WORDS } = require("./profile");
const { labelKey } = require("./quality");
const { unprocessable } = require("../utils/errors");

const ALPHA = 0.05;
const ENGINE = "Hosptic statistics engine (jStat, Simple Statistics)";
const MAX_SCATTER_POINTS = 500;

// ------------------------------------------------------------------ helpers

// Rounds for output. p-values keep 4 significant figures; NaN becomes null.
function clean(value, key = "") {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (/(^p|P)Value$|ExactP$/.test(key)) return Number(value.toPrecision(4));
    return Number(value.toFixed(6));
  }
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
  }
  return value;
}

const fmtP = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x).toFixed(d) : "n/a");

function colIndex(table, name) {
  const i = table.columns.indexOf(name);
  if (i < 0) throw unprocessable(`Column "${name}" is not in the dataset`);
  return i;
}

// Category labels grouped case- and space-insensitively, shown with the most
// common spelling. Yes/No style values are normalised to "Yes" and "No".
function categoryMapper(table, i) {
  const spellings = new Map();
  for (const r of table.rows) {
    if (isMissing(r[i])) continue;
    const raw = String(r[i]).trim();
    const k = labelKey(raw);
    if (!spellings.has(k)) spellings.set(k, new Map());
    spellings.get(k).set(raw, (spellings.get(k).get(raw) || 0) + 1);
  }
  const canon = new Map();
  for (const [k, m] of spellings) {
    let label = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (TRUE_WORDS.has(k)) label = "Yes";
    if (FALSE_WORDS.has(k)) label = "No";
    canon.set(k, label);
  }
  return (v) => (isMissing(v) ? null : canon.get(labelKey(String(v).trim())) ?? null);
}

// Listwise deletion over the given extractors. Returns aligned arrays.
function complete(table, extractors) {
  const out = extractors.map(() => []);
  let excluded = 0;
  for (const r of table.rows) {
    const vals = extractors.map((f) => f(r));
    if (vals.some((v) => v === null || (typeof v === "number" && !Number.isFinite(v)))) {
      excluded++;
      continue;
    }
    vals.forEach((v, j) => out[j].push(v));
  }
  return { values: out, excluded, n: out[0].length };
}

const numGetter = (i) => (r) => (isMissing(r[i]) ? null : toNumber(r[i]));

function assumption(name, status, detail) {
  return { name, status, detail };
}

function normalityAssumption(label, values) {
  const nsc = S.normalityScreen(values);
  if (nsc.concern === "none") {
    return assumption(
      `Approximate normality (${label})`,
      values.length >= 30 ? "met" : "caution",
      values.length >= 30
        ? `n = ${values.length}; with 30 or more observations the test is robust to moderate non-normality (skewness ${fmt(nsc.skewness)}).`
        : `n = ${values.length}; skewness ${fmt(nsc.skewness)}. Small samples make normality hard to confirm.`
    );
  }
  return assumption(
    `Approximate normality (${label})`,
    "violated",
    `Skewness ${fmt(nsc.skewness)}, excess kurtosis ${fmt(nsc.excessKurtosis)} with n = ${values.length}. Results may be unreliable; see the non-parametric check.`
  );
}

const COMMON_LIMITATIONS = [
  "Statistical association does not establish cause and effect.",
  "Results describe this dataset only and may not generalise to other hospitals or periods.",
  "Normality is screened with skewness and kurtosis, not a formal Shapiro-Wilk test.",
];

function missingNote(excluded, total) {
  return excluded
    ? `${excluded} of ${total} rows were excluded because a required value was missing or invalid (listwise deletion).`
    : "No rows were excluded for missing values.";
}

// ------------------------------------------------------------------ runners

function runDescriptive(table, plan) {
  const results = { variables: [] };
  const charts = [];
  for (const name of plan.variables.columns) {
    const i = colIndex(table, name);
    const nums = table.rows.map((r) => (isMissing(r[i]) ? NaN : toNumber(r[i]))).filter(Number.isFinite);
    const present = table.rows.filter((r) => !isMissing(r[i])).length;
    if (nums.length >= present * 0.95 && nums.length > 0) {
      const d = S.describe(nums);
      results.variables.push({ column: name, kind: "numeric", missing: table.rows.length - nums.length, ...d });
      charts.push({ type: "histogram", column: name, ...S.histogram(nums) });
    } else {
      const map = categoryMapper(table, i);
      const vals = table.rows.map((r) => map(r[i])).filter((v) => v !== null);
      results.variables.push({ column: name, kind: "categorical", n: vals.length, missing: table.rows.length - vals.length, frequencies: S.frequencies(vals) });
      charts.push({ type: "bar", column: name, data: S.frequencies(vals).map((f) => ({ label: f.value, value: f.count })) });
    }
  }
  return {
    methodology: { test: "Descriptive statistics", description: "Summaries of each selected column. Numeric: mean, median, mode, SD, variance, range, quartiles, 95% CI of the mean (t-based). Categorical: counts and proportions with Wilson 95% intervals." },
    results,
    assumptions: [],
    limitations: ["Descriptive statistics summarise the data and do not test hypotheses.", COMMON_LIMITATIONS[1]],
    visualizationData: { charts },
  };
}

function runFrequency(table, plan) {
  const out = runDescriptive(table, { variables: { columns: plan.variables.columns } });
  out.methodology = { test: "Frequency distribution", description: "Counts and proportions per category with Wilson score 95% intervals." };
  return out;
}

function runDistribution(table, plan) {
  const i = colIndex(table, plan.variables.outcome);
  const { values: [x], excluded } = complete(table, [numGetter(i)]);
  if (x.length < 3) throw unprocessable("At least 3 numeric values are needed for a distribution summary");
  const d = S.describe(x);
  const h = S.histogram(x);
  const nsc = S.normalityScreen(x);
  return {
    methodology: { test: "Distribution summary", description: `Histogram (${h.method.replace("_", "-")} bin width), quartiles and shape statistics.`, missingData: missingNote(excluded, table.rows.length) },
    results: { column: plan.variables.outcome, ...d, excessKurtosis: nsc.excessKurtosis, histogram: h.bins },
    assumptions: [],
    limitations: [COMMON_LIMITATIONS[2], "Bin width changes the visual shape of a histogram."],
    visualizationData: { charts: [{ type: "histogram", column: plan.variables.outcome, bins: h.bins }, { type: "box", column: plan.variables.outcome, min: d.min, q1: d.q1, median: d.median, q3: d.q3, max: d.max }] },
  };
}

function groupSplit(table, plan) {
  const yi = colIndex(table, plan.variables.outcome);
  const gi = colIndex(table, plan.variables.group);
  const map = categoryMapper(table, gi);
  const { values: [y, g], excluded } = complete(table, [numGetter(yi), (r) => map(r[gi])]);
  const groups = new Map();
  g.forEach((label, k) => {
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(y[k]);
  });
  return { groups, excluded };
}

function groupSummaries(groups) {
  return [...groups.entries()].map(([label, vals]) => {
    const d = S.describe(vals);
    return { group: label, n: d.n, mean: d.mean, sd: d.sd, median: d.median, q1: d.q1, q3: d.q3, min: d.min, max: d.max, meanCi95: d.meanCi95 };
  });
}

function runIndependentT(table, plan) {
  let { groups, excluded } = groupSplit(table, plan);
  if (plan.groupLevels) {
    const wanted = plan.groupLevels.map((l) => labelKey(l));
    const picked = [...groups.entries()].filter(([label]) => wanted.includes(labelKey(label)));
    if (picked.length !== 2) throw unprocessable(`Could not find both groups ${plan.groupLevels.join(" and ")} in "${plan.variables.group}"`);
    groups = new Map(picked);
  }
  if (groups.size !== 2) throw unprocessable(`"${plan.variables.group}" must have exactly 2 groups with data; it has ${groups.size}`);
  const [[la, a], [lb, b]] = [...groups.entries()];
  if (a.length < 2 || b.length < 2) throw unprocessable("Each group needs at least 2 values");

  const t = S.independentT(a, b);
  const nsA = S.normalityScreen(a);
  const nsB = S.normalityScreen(b);
  const doubtful = nsA.concern !== "none" || nsB.concern !== "none";
  const mw = S.mannWhitney(a, b);
  const lev = S.levene([a, b]);

  const assumptions = [
    assumption("Independent observations", "not_checked", "Each row must be a different patient. This cannot be verified from the data."),
    normalityAssumption(`${plan.variables.outcome} in ${la}`, a),
    normalityAssumption(`${plan.variables.outcome} in ${lb}`, b),
    assumption("Equal variances", lev.pValue < ALPHA ? "violated" : "met", `Brown-Forsythe Levene test p = ${fmtP(lev.pValue)}. Welch's t-test does not require equal variances, so this does not invalidate the result.`),
  ];
  if (a.length < 10 || b.length < 10) assumptions.push(assumption("Adequate sample size", "caution", `Group sizes are ${a.length} and ${b.length}. Small groups give wide intervals and low power.`));

  return {
    methodology: {
      test: "Welch's independent-samples t-test",
      description: `Compares the mean ${plan.variables.outcome} between ${la} and ${lb} without assuming equal variances. Two-sided, alpha = ${ALPHA}. Effect size: Cohen's d (pooled SD) and Hedges' g.`,
      robustnessCheck: "Mann-Whitney U test (normal approximation with tie and continuity correction).",
      missingData: missingNote(excluded, table.rows.length),
    },
    results: {
      groups: groupSummaries(new Map([[la, a], [lb, b]])),
      sampleSize: a.length + b.length,
      testStatistic: { name: "t", value: t.t },
      degreesOfFreedom: t.df,
      pValue: t.pValue,
      meanDifference: t.meanDifference,
      meanDifferenceLabel: `${la} minus ${lb}`,
      confidenceInterval95: t.ci95,
      effectSize: { cohensD: t.cohensD, hedgesG: t.hedgesG },
      significantAtAlpha: t.pValue < ALPHA,
      levene: lev,
      mannWhitney: { U: mw.U, z: mw.z, pValue: mw.pValue, rankBiserial: mw.rankBiserial, reportedBecause: doubtful ? "normality in doubt" : "robustness check" },
    },
    assumptions,
    limitations: [...COMMON_LIMITATIONS, "Only two groups are compared; other factors that differ between groups are not adjusted for."],
    visualizationData: {
      charts: [
        { type: "group_means", outcome: plan.variables.outcome, group: plan.variables.group, data: groupSummaries(new Map([[la, a], [lb, b]])).map((g) => ({ label: g.group, mean: g.mean, ci95: g.meanCi95, n: g.n })) },
        { type: "box_by_group", outcome: plan.variables.outcome, data: groupSummaries(new Map([[la, a], [lb, b]])).map((g) => ({ label: g.group, min: g.min, q1: g.q1, median: g.median, q3: g.q3, max: g.max })) },
      ],
    },
  };
}

function runPairedT(table, plan) {
  const [c1, c2] = plan.variables.columns;
  const { values: [a, b], excluded } = complete(table, [numGetter(colIndex(table, c1)), numGetter(colIndex(table, c2))]);
  if (a.length < 3) throw unprocessable("At least 3 complete pairs are needed for a paired t-test");
  const r = S.pairedT(a, b);
  return {
    methodology: {
      test: "Paired-samples t-test",
      description: `Tests whether the mean of ${c1} minus ${c2}, measured on the same rows, differs from zero. Two-sided, alpha = ${ALPHA}. Effect size: Cohen's dz.`,
      missingData: missingNote(excluded, table.rows.length),
    },
    results: {
      sampleSize: a.length,
      means: { [c1]: S.describe(a).mean, [c2]: S.describe(b).mean },
      testStatistic: { name: "t", value: r.t },
      degreesOfFreedom: r.df,
      pValue: r.pValue,
      meanDifference: r.meanDifference,
      meanDifferenceLabel: `${c1} minus ${c2}`,
      sdOfDifferences: r.sdDifference,
      confidenceInterval95: r.ci95,
      effectSize: { cohensDz: r.cohensDz },
      significantAtAlpha: r.pValue < ALPHA,
    },
    assumptions: [
      assumption("Paired measurements", "not_checked", `Each row must hold two measurements of the same subject (${c1} and ${c2}).`),
      normalityAssumption("differences", r.diffs),
    ],
    limitations: COMMON_LIMITATIONS,
    visualizationData: { charts: [{ type: "histogram", column: `${c1} minus ${c2}`, ...S.histogram(r.diffs) }] },
  };
}

function runAnova(table, plan) {
  const { groups, excluded } = groupSplit(table, plan);
  const small = [...groups.entries()].filter(([, v]) => v.length < 2).map(([k]) => k);
  for (const k of small) groups.delete(k);
  if (groups.size < 3) throw unprocessable(`ANOVA needs at least 3 groups with 2 or more values; "${plan.variables.group}" has ${groups.size}`);
  const arrays = [...groups.values()];
  const r = S.oneWayAnova(arrays);
  const lev = S.levene(arrays);
  const unequal = lev.pValue < ALPHA;
  const welch = S.welchAnova(arrays);
  const nonNormal = [...groups.entries()].filter(([, v]) => S.normalityScreen(v).concern !== "none").map(([k]) => k);

  const assumptions = [
    assumption("Independent observations", "not_checked", "Each row must be a different patient. This cannot be verified from the data."),
    assumption(
      "Approximate normality within groups",
      nonNormal.length ? "violated" : "met",
      nonNormal.length ? `Skewed distributions in: ${nonNormal.join(", ")}.` : "No group showed a strong departure from normality."
    ),
    assumption(
      "Equal variances",
      unequal ? "violated" : "met",
      `Brown-Forsythe Levene test p = ${fmtP(lev.pValue)}.${unequal ? " Welch's ANOVA is reported and should be preferred." : ""}`
    ),
  ];
  return {
    methodology: {
      test: "One-way ANOVA",
      description: `Compares mean ${plan.variables.outcome} across ${groups.size} groups of ${plan.variables.group}. alpha = ${ALPHA}. Effect sizes: eta squared and omega squared. Welch's ANOVA is reported for unequal variances.`,
      missingData: missingNote(excluded, table.rows.length) + (small.length ? ` Groups with fewer than 2 values were dropped: ${small.join(", ")}.` : ""),
      preferredResult: unequal ? "welchAnova" : "anova",
    },
    results: {
      groups: groupSummaries(groups),
      sampleSize: arrays.reduce((s, a) => s + a.length, 0),
      testStatistic: { name: "F", value: r.F },
      degreesOfFreedom: { between: r.df1, within: r.df2 },
      pValue: r.pValue,
      effectSize: { etaSquared: r.etaSquared, omegaSquared: r.omegaSquared },
      significantAtAlpha: (unequal ? welch.pValue : r.pValue) < ALPHA,
      welchAnova: welch,
      levene: lev,
    },
    assumptions,
    limitations: [...COMMON_LIMITATIONS, "ANOVA shows whether any group means differ, not which ones. Post-hoc pairwise tests are not included in this version."],
    visualizationData: {
      charts: [{ type: "group_means", outcome: plan.variables.outcome, group: plan.variables.group, data: groupSummaries(groups).map((g) => ({ label: g.group, mean: g.mean, ci95: g.meanCi95, n: g.n })) }],
    },
  };
}

function runChiSquare(table, plan) {
  const [rName, cName] = plan.variables.columns;
  const ri = colIndex(table, rName);
  const ci = colIndex(table, cName);
  const rm = categoryMapper(table, ri);
  const cm = categoryMapper(table, ci);
  const { values: [xs, ys], excluded } = complete(table, [(r) => rm(r[ri]), (r) => cm(r[ci])]);
  const ct = S.crosstab(xs, ys);
  if (ct.rowLevels.length < 2 || ct.colLevels.length < 2) throw unprocessable("Both columns need at least 2 categories with data");
  const r = S.chiSquare(ct.table);
  const violated = r.minExpected < 1 || r.shareExpectedBelow5 > 0.2;
  const is2x2 = ct.rowLevels.length === 2 && ct.colLevels.length === 2;

  const rowPercents = ct.table.map((row) => {
    const tot = row.reduce((s, x) => s + x, 0);
    return row.map((x) => (tot ? x / tot : 0));
  });

  return {
    methodology: {
      test: "Pearson's chi-square test of independence",
      description: `Tests whether ${rName} and ${cName} are associated. alpha = ${ALPHA}. Effect size: Cramer's V.${is2x2 ? " For 2x2 tables the odds ratio and Fisher's exact test are also reported." : ""}`,
      missingData: missingNote(excluded, table.rows.length),
      preferredResult: violated && is2x2 ? "fisherExactP" : "chiSquare",
    },
    results: {
      sampleSize: r.n,
      contingencyTable: { rows: ct.rowLevels, columns: ct.colLevels, counts: ct.table, rowProportions: rowPercents, expected: r.expected },
      testStatistic: { name: "chi-square", value: r.chiSquare },
      degreesOfFreedom: r.df,
      pValue: r.pValue,
      effectSize: { cramersV: r.cramersV },
      ...(is2x2 ? { fisherExactP: r.fisherExactP, oddsRatio: r.oddsRatio, oddsRatioCi95: r.oddsRatioCi95, oddsRatioLabel: `odds of "${ct.colLevels[0]}" in "${ct.rowLevels[0]}" vs "${ct.rowLevels[1]}"` } : {}),
      significantAtAlpha: (violated && is2x2 ? r.fisherExactP : r.pValue) < ALPHA,
    },
    assumptions: [
      assumption("Independent observations", "not_checked", "Each row must be a different patient."),
      assumption(
        "Expected cell counts",
        violated ? "violated" : "met",
        `${r.cellsExpectedBelow5} of ${r.expected.flat().length} cells have expected count below 5 (minimum ${fmt(r.minExpected)}).${violated ? (is2x2 ? " Use Fisher's exact p-value." : " The chi-square p-value may be inaccurate; consider merging categories.") : ""}`
      ),
    ],
    limitations: [...COMMON_LIMITATIONS, "Chi-square shows whether an association exists, not its direction or cause."],
    visualizationData: {
      charts: [
        {
          type: "grouped_bar",
          x: rName,
          series: cName,
          categories: ct.rowLevels,
          data: ct.colLevels.map((c, j) => ({ label: c, values: rowPercents.map((row) => row[j]) })),
          valueFormat: "proportion",
        },
      ],
    },
  };
}

function scatterSample(x, y) {
  if (x.length <= MAX_SCATTER_POINTS) return x.map((xi, i) => ({ x: xi, y: y[i] }));
  const step = x.length / MAX_SCATTER_POINTS;
  return Array.from({ length: MAX_SCATTER_POINTS }, (_, k) => {
    const i = Math.floor(k * step);
    return { x: x[i], y: y[i] };
  });
}

function runCorrelation(table, plan, method) {
  const [xn, yn] = plan.variables.columns;
  const { values: [x, y], excluded } = complete(table, [numGetter(colIndex(table, xn)), numGetter(colIndex(table, yn))]);
  if (x.length < 4) throw unprocessable("At least 4 complete pairs are needed for a correlation");
  if (S.describe(x).sd === 0 || S.describe(y).sd === 0) throw unprocessable("One of the columns has no variation");
  const pearson = method === "pearson";
  const r = pearson ? S.pearson(x, y) : S.spearman(x, y);
  const coef = pearson ? r.r : r.rho;
  const assumptions = pearson
    ? [
        assumption("Independent observations", "not_checked", "Each row must be a different patient."),
        assumption("Linear relationship", "not_checked", "Pearson's r measures linear association only. Check the scatter plot."),
        normalityAssumption(xn, x),
        normalityAssumption(yn, y),
      ]
    : [
        assumption("Independent observations", "not_checked", "Each row must be a different patient."),
        assumption("Monotonic relationship", "not_checked", "Spearman's rho measures monotonic association. Check the scatter plot."),
      ];
  return {
    methodology: {
      test: pearson ? "Pearson correlation" : "Spearman rank correlation",
      description: pearson
        ? `Linear correlation between ${xn} and ${yn}. Two-sided t-test of r = 0; 95% CI via Fisher's z.`
        : `Rank correlation between ${xn} and ${yn} with average ranks for ties. p-value from the t approximation; 95% CI via Fisher's z with the Fieller-Hartley-Pearson standard error.`,
      missingData: missingNote(excluded, table.rows.length),
    },
    results: {
      sampleSize: r.n,
      coefficient: { name: pearson ? "r" : "rho", value: coef },
      ...(pearson ? { rSquared: r.rSquared } : {}),
      testStatistic: { name: "t", value: r.t },
      degreesOfFreedom: r.df,
      pValue: r.pValue,
      confidenceInterval95: r.ci95,
      effectSize: { [pearson ? "r" : "rho"]: coef },
      significantAtAlpha: r.pValue < ALPHA,
    },
    assumptions,
    limitations: [...COMMON_LIMITATIONS, ...(pearson ? [] : ["Spearman p-values use an approximation that is less accurate below n = 10."])],
    visualizationData: { charts: [{ type: "scatter", x: xn, y: yn, points: scatterSample(x, y), sampled: x.length > MAX_SCATTER_POINTS }] },
  };
}

function runRegression(table, plan) {
  const xn = plan.variables.predictor;
  const yn = plan.variables.outcome;
  const { values: [x, y], excluded } = complete(table, [numGetter(colIndex(table, xn)), numGetter(colIndex(table, yn))]);
  if (x.length < 4) throw unprocessable("At least 4 complete pairs are needed for regression");
  if (S.describe(x).sd === 0) throw unprocessable(`"${xn}" has no variation`);
  const r = S.linearRegression(x, y);
  const resid = S.normalityScreen(r.residuals);
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  return {
    methodology: {
      test: "Simple linear regression (ordinary least squares)",
      description: `Models ${yn} as intercept + slope x ${xn}. t-tests on coefficients, 95% CIs, R squared.`,
      missingData: missingNote(excluded, table.rows.length),
    },
    results: {
      sampleSize: r.n,
      equation: `${yn} = ${fmt(r.intercept, 4)} + ${fmt(r.slope, 4)} x ${xn}`,
      coefficients: [
        { term: "intercept", estimate: r.intercept, standardError: r.interceptSe, t: r.interceptT, pValue: r.interceptPValue, ci95: r.interceptCi95 },
        { term: xn, estimate: r.slope, standardError: r.slopeSe, t: r.slopeT, pValue: r.slopePValue, ci95: r.slopeCi95 },
      ],
      testStatistic: { name: "t (slope)", value: r.slopeT },
      degreesOfFreedom: r.df,
      pValue: r.slopePValue,
      confidenceInterval95: r.slopeCi95,
      rSquared: r.rSquared,
      adjustedRSquared: r.adjustedRSquared,
      residualStandardError: r.residualStandardError,
      fStatistic: { value: r.F, df1: 1, df2: r.df, pValue: r.fPValue },
      effectSize: { rSquared: r.rSquared },
      significantAtAlpha: r.slopePValue < ALPHA,
    },
    assumptions: [
      assumption("Linearity", "not_checked", "Check the scatter plot for a straight-line pattern."),
      assumption("Independent observations", "not_checked", "Each row must be a different patient."),
      assumption(
        "Normally distributed residuals",
        resid.concern === "none" ? "met" : "violated",
        `Residual skewness ${fmt(resid.skewness)}.`
      ),
      assumption(
        "No extreme residuals",
        r.largeStandardisedResiduals ? "caution" : "met",
        `${r.largeStandardisedResiduals} residuals exceed 3 residual standard errors.`
      ),
    ],
    limitations: [...COMMON_LIMITATIONS, "Only one predictor is modelled; confounders are not adjusted for.", `Predictions outside the observed range of ${xn} (${fmt(minX)} to ${fmt(maxX)}) are extrapolations.`],
    visualizationData: {
      charts: [
        {
          type: "scatter",
          x: xn,
          y: yn,
          points: scatterSample(x, y),
          sampled: x.length > MAX_SCATTER_POINTS,
          line: [
            { x: minX, y: r.intercept + r.slope * minX },
            { x: maxX, y: r.intercept + r.slope * maxX },
          ],
        },
      ],
    },
  };
}

const RUNNERS = {
  descriptive: runDescriptive,
  frequency: runFrequency,
  distribution: runDistribution,
  independent_t_test: runIndependentT,
  paired_t_test: runPairedT,
  one_way_anova: runAnova,
  chi_square: runChiSquare,
  pearson_correlation: (t, p) => runCorrelation(t, p, "pearson"),
  spearman_correlation: (t, p) => runCorrelation(t, p, "spearman"),
  linear_regression: runRegression,
};

// Plan must already be validated by analytics/plan.js.
function runAnalysis(table, plan, { notes = [] } = {}) {
  const out = RUNNERS[plan.analysisType](table, plan);
  out.methodology = {
    analysisType: plan.analysisType,
    variables: plan.variables,
    alpha: ALPHA,
    engine: ENGINE,
    ...out.methodology,
    ...(notes.length ? { planNotes: notes } : {}),
  };
  verifyResults(out.results);
  return clean(out);
}

// Guards against reporting impossible values.
function verifyResults(results) {
  const bad = [];
  const walk = (v, path) => {
    if (typeof v === "number") {
      if (/pValue$|ExactP$/.test(path) && (v < 0 || v > 1)) bad.push(path);
      if (/cramersV$|rSquared$|etaSquared$/.test(path) && (v < -1e-9 || v > 1 + 1e-9)) bad.push(path);
      if (/\.(r|rho)$/.test(path) && Math.abs(v) > 1 + 1e-9) bad.push(path);
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(results, "results");
  if (bad.length) throw new Error(`Statistical verification failed: ${bad.join(", ")}`);
}

module.exports = { runAnalysis, fmtP, ALPHA };
