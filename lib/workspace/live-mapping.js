// Translates backend records (shared/contracts/openapi.yaml) into the shapes the workspace renders.
// Pure functions, no network. Every number shown comes from the backend's computed results; the
// headline is written here from those numbers, never from the AI text.

const TYPE_MAP = { NUMERIC: "numeric", CATEGORICAL: "categorical", BOOLEAN: "binary", DATE: "date", TEXT: "text" };

const num = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString(undefined, { maximumFractionDigits: d }) : "—");
const pctOf = (k, n, d = 1) => (n ? `${((k / n) * 100).toFixed(d)}%` : "—");
// Uses the backend's display string when present; otherwise formats the computed p-value, so a
// headline never shows "null" against an older backend.
const pText = (r) => {
  if (typeof r?.pValueDisplay === "string") return r.pValueDisplay.startsWith("<") ? `p < ${r.pValueDisplay.slice(1)}` : `p = ${r.pValueDisplay}`;
  if (typeof r?.pValue === "number" && Number.isFinite(r.pValue)) return r.pValue < 0.001 ? "p < 0.001" : `p = ${r.pValue.toFixed(3)}`;
  return null;
};
const isSig = (r, alpha = 0.05) => typeof r?.pValue === "number" && r.pValue < alpha;
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const YES = /^(yes|true|1|y|positive)$/i;

// ---------------------------------------------------------------------------
// Datasets

/** Dataset detail (GET /datasets/:id) to the summary the picker, variable panel and datasets page use. */
export function toDatasetSummary(d) {
  const columns = Array.isArray(d.columns) ? [...d.columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
  const analysable = columns.filter((c) => !c.isSensitive);
  return {
    id: d.id,
    name: d.name,
    description: d.description || `Uploaded from ${d.originalFileName}`,
    unit: "rows",
    source: d.originalFileName,
    updated: d.updatedAt || d.createdAt,
    rows: d.rowCount ?? 0,
    status: d.status,
    fileType: d.fileType,
    sensitiveColumns: columns.filter((c) => c.isSensitive).map((c) => c.name),
    variables: analysable.map((c) => ({
      key: c.name,
      label: c.name,
      type: TYPE_MAP[c.inferredType] || "text",
      unit: null,
      missing: c.missingCount ?? 0,
    })),
    starters: startersFor(analysable),
  };
}

/** Suggested first questions built from the dataset's own columns. */
export function startersFor(columns) {
  const numeric = columns.filter((c) => c.inferredType === "NUMERIC").map((c) => c.name);
  const groups = columns
    .filter((c) => (c.inferredType === "CATEGORICAL" || c.inferredType === "BOOLEAN") && (c.uniqueCount ?? 0) >= 2 && (c.uniqueCount ?? 99) <= 15)
    .map((c) => c.name);
  const out = [];
  if (numeric[0]) out.push({ kind: "Distribution", icon: "distribution", q: `Summarise ${numeric[0]}` });
  if (numeric[0] && groups[0]) out.push({ kind: "Compare", icon: "compare", q: `Does ${numeric[0]} differ by ${groups[0]}?` });
  if (groups.length >= 2) out.push({ kind: "Association", icon: "drivers", q: `Is ${groups[0]} associated with ${groups[1]}?` });
  if (numeric.length >= 2) out.push({ kind: "Relationship", icon: "relationship", q: `Is ${numeric[0]} related to ${numeric[1]}?` });
  if (!out.length && groups[0]) out.push({ kind: "Distribution", icon: "distribution", q: `How common is each ${groups[0]} value?` });
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Charts

/** visualizationData to the chart and table evidence items the workspace draws. */
export function toEvidence(viz, results = {}) {
  const groupName = results?.variables?.group;
  if (!viz || typeof viz !== "object") return [];
  switch (viz.type) {
    case "histogram": {
      const bins = viz.bins || [];
      return [{
        kind: "chart",
        title: `Distribution of ${viz.variable}`,
        caption: "Number of rows in each range.",
        chart: {
          type: "histogram",
          xKey: "bin",
          data: bins.map((b) => ({ bin: `${num(b.start, 2)}–${num(b.end, 2)}`, n: b.count })),
          series: [{ key: "n", label: "Rows" }],
          xLabel: viz.variable,
        },
      }];
    }
    case "bar": {
      const cats = viz.categories || [];
      const total = cats.reduce((a, c) => a + c.count, 0);
      const top = [...cats].sort((a, b) => b.count - a.count)[0];
      // For yes/no columns the "Yes" bar is the finding, whatever its size.
      const yes = cats.length <= 2 ? cats.find((c) => YES.test(String(c.label).trim())) : null;
      return [{
        kind: "chart",
        title: viz.variable,
        caption: `Number of rows in each ${viz.variable} category.`,
        chart: {
          type: "bar",
          xKey: "level",
          data: cats.map((c) => ({ level: String(c.label), count: c.count, share: total ? Number(((c.count / total) * 100).toFixed(1)) : 0 })),
          series: [{ key: "count", label: "Count" }],
          yUnit: "",
          yLabel: "Count",
          highlight: yes ? String(yes.label) : top ? String(top.label) : null,
        },
      }];
    }
    case "groupSummary": {
      const groups = viz.groups || [];
      return [{
        kind: "chart",
        title: groupName ? `${viz.variable} by ${groupName}` : `${viz.variable} across groups`,
        caption: results?.highlightGroup
          ? `Box shows the middle 50% with the median line. Whiskers show the full range. ${results.highlightGroup} has the highest mean, and the difference is statistically significant.`
          : "Box shows the middle 50% with the median line. Whiskers show the full range.",
        chart: {
          type: "box",
          xKey: "group",
          yLabel: viz.variable,
          yUnit: "",
          rangeLabel: "Range",
          highlight: results?.highlightGroup || null,
          data: groups.map((g) => ({ group: String(g.group), min: g.min, q1: g.q1, median: g.median, q3: g.q3, max: g.max, mean: g.mean, n: g.sampleSize })),
        },
      }];
    }
    case "heatmap": {
      const rows = viz.rows || [];
      const cols = viz.columns || [];
      const observed = viz.observed || [];
      const colTotals = cols.map((_, j) => observed.reduce((a, r) => a + (r[j] || 0), 0));
      const outcome = results?.variables?.outcome;
      return [{
        kind: "table",
        title: "Counts in each combination (column percentage in brackets)",
        columns: [{ key: "row", label: outcome || "" }, ...cols.map((c, j) => ({ key: `c${j}`, label: String(c), align: "right" }))],
        rows: rows.map((r, i) => ({
          row: String(r),
          ...Object.fromEntries(cols.map((_, j) => [`c${j}`, `${(observed[i]?.[j] ?? 0).toLocaleString()} (${pctOf(observed[i]?.[j] ?? 0, colTotals[j])})`])),
        })),
      }];
    }
    case "scatter": {
      const points = viz.points || [];
      const fit = viz.fitLine;
      return [{
        kind: "chart",
        title: `${viz.y} against ${viz.x}`,
        caption: fit ? "Each dot is one row. The line is the fitted regression." : "Each dot is one row.",
        chart: {
          type: "scatter",
          xLabel: viz.x,
          yLabel: viz.y,
          // The backend sends each point as { x: outcome, y: predictor } while labelling x as the
          // predictor (backend/src/analytics/engine.js, runCorrelation and runRegression). Swap so the
          // x axis really is the predictor and matches the fit line, which uses predictor values.
          data: points.map((pt) => ({ x: pt.y, y: pt.x })),
          trend: fit ? [{ x: fit.xMin, y: fit.intercept + fit.slope * fit.xMin }, { x: fit.xMax, y: fit.intercept + fit.slope * fit.xMax }] : [],
        },
      }];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Analyses

function sampleSizeOf(r) {
  const s = r?.sampleSize;
  if (typeof s === "number") return s;
  if (!s || typeof s !== "object") return null;
  return s.total ?? s.valid ?? s.pairs ?? null;
}

/** One-line finding built from computed results only. */
export function headlineFor(a) {
  const r = a.results || {};
  const v = a.methodology?.variables || {};
  const p = pText(r);
  const sig = isSig(r, a.methodology?.alpha);
  switch (a.analysisType) {
    case "DESCRIPTIVE": {
      if (r.summary) return `${v.outcome} averages ${num(r.summary.mean)} (median ${num(r.summary.median)}, n = ${num(r.summary.sampleSize, 0)})`;
      const f = r.frequencies || [];
      const total = f.reduce((acc, x) => acc + x.count, 0);
      const yes = f.find((x) => YES.test(String(x.label).trim()));
      if (f.length <= 2 && yes) return `${pctOf(yes.count, total)} of rows have ${v.outcome} (${yes.count.toLocaleString()} of ${total.toLocaleString()})`;
      if (f[0]) return `${f[0].label} is the most common ${v.outcome}, at ${pctOf(f[0].count, total)} (${f[0].count.toLocaleString()} of ${total.toLocaleString()})`;
      return `Summary of ${v.outcome}`;
    }
    case "INDEPENDENT_T_TEST":
    case "ONE_WAY_ANOVA": {
      const groups = [...(r.groups || [])].sort((x, y) => y.mean - x.mean);
      const hi = groups[0];
      const lo = groups[groups.length - 1];
      const yesNo = groups.length === 2 && groups.every((g) => /^(yes|no|true|false|y|n)$/i.test(String(g.group).trim()));
      if (sig && yesNo) return `${v.outcome} is higher when ${v.group} is ${hi.group} (mean ${num(hi.mean)}) than when it is ${lo.group} (mean ${num(lo.mean)}), ${p}`;
      if (sig && hi && lo && groups.length === 2) return `${v.outcome} is higher in ${hi.group} (mean ${num(hi.mean)}) than in ${lo.group} (mean ${num(lo.mean)}), ${p}`;
      if (sig && hi && lo) return `${v.outcome} differs by ${v.group}: highest in ${hi.group} (mean ${num(hi.mean)}) and lowest in ${lo.group} (mean ${num(lo.mean)}), ${p}`;
      return `No statistically significant difference in ${v.outcome} by ${v.group}${p ? ` (${p})` : ""}`;
    }
    case "PAIRED_T_TEST": {
      const diff = r.meanDifference;
      if (sig) return `${v.outcome} is on average ${num(Math.abs(diff))} ${diff < 0 ? "lower" : "higher"} than ${v.pairedWith} (${p})`;
      return `No statistically significant difference between ${v.outcome} and ${v.pairedWith}${p ? ` (${p})` : ""}`;
    }
    case "CHI_SQUARE":
      return sig
        ? `${v.outcome} is associated with ${v.group} (${p}${r.effectSize ? `, ${r.effectSize.name} ${num(r.effectSize.value)}` : ""})`
        : `No statistically significant association between ${v.outcome} and ${v.group}${p ? ` (${p})` : ""}`;
    case "PEARSON_CORRELATION":
    case "SPEARMAN_CORRELATION": {
      const rv = r.effectSize?.value;
      const strength = Math.abs(rv) >= 0.5 ? "strong" : Math.abs(rv) >= 0.3 ? "moderate" : Math.abs(rv) >= 0.1 ? "weak" : "very weak";
      const dir = rv > 0 ? "positive" : "negative";
      return sig
        ? `${v.predictor} and ${v.outcome} have a ${strength} ${dir} relationship (${r.effectSize.name} ${num(rv)}, ${p})`
        : `No statistically significant relationship between ${v.predictor} and ${v.outcome} (${r.effectSize?.name || "r"} ${num(rv)}${p ? `, ${p}` : ""})`;
    }
    case "LINEAR_REGRESSION": {
      const slope = r.coefficients?.slope?.estimate;
      return sig
        ? `Each 1-unit increase in ${v.predictor} goes with a ${num(slope)} change in ${v.outcome} (${p})`
        : `${v.predictor} does not significantly predict ${v.outcome}${p ? ` (${p})` : ""}`;
    }
    default:
      return a.methodology?.name || "Analysis result";
  }
}

/** Degrees of freedom as a number, a list, or ANOVA's { between, within } pair ("2, 147"). */
export function dfText(df) {
  if (Array.isArray(df)) return df.map((d) => num(d, 4)).join(", ");
  if (df && typeof df === "object") return [df.between, df.within].filter((d) => d !== undefined).map((d) => num(d, 4)).join(", ");
  return num(df, 4);
}

/** Summary numbers for the strip under the evidence. The p-value is left out when the headline shows it. */
export function statsItems(a, headline = "") {
  const r = a.results || {};
  const items = [];
  const n = sampleSizeOf(r);
  if (n !== null) items.push({ label: "Sample size", value: num(n, 0) });
  if (r.summary) {
    items.push({ label: "Mean", value: num(r.summary.mean) }, { label: "Median", value: num(r.summary.median) }, { label: "Middle 50%", value: `${num(r.summary.q1)} – ${num(r.summary.q3)}` });
  }
  // Category counts with the backend's percentages, largest first (at most four tiles).
  for (const f of (r.frequencies || []).slice(0, 4)) items.push({ label: String(f.label), value: `${f.count.toLocaleString()} (${num(f.percent, 1)}%)` });
  if (r.testStatistic) items.push({ label: r.testStatistic.name, value: num(r.testStatistic.value, 3) });
  const p = pText(r);
  if (p && !String(headline).includes(p)) items.push({ label: "p-value", value: p.replace(/^p [=<] ?/, (m) => (m.includes("<") ? "< " : "")) });
  if (r.effectSize) items.push({ label: r.effectSize.name, value: num(r.effectSize.value, 3) });
  if (r.confidenceInterval) items.push({ label: `${Math.round((r.confidenceInterval.level ?? 0.95) * 100)}% CI`, value: `${num(r.confidenceInterval.lower, 3)} – ${num(r.confidenceInterval.upper, 3)}` });
  if (r.rSquared !== undefined) items.push({ label: "R²", value: num(r.rSquared, 3) });
  return items.slice(0, 6);
}

function technicalResults(a) {
  const r = a.results || {};
  const rows = [];
  const add = (label, value) => { if (value !== undefined && value !== null && value !== "") rows.push({ label, value: String(value) }); };
  const n = sampleSizeOf(r);
  add("Sample size", n !== null ? `n = ${num(n, 0)}` : null);
  add("Rows excluded (missing or invalid)", a.methodology?.excludedRows);
  if (r.summary) {
    add("Mean (SD)", `${num(r.summary.mean, 3)} (${num(r.summary.standardDeviation, 3)})`);
    add("Median [IQR]", `${num(r.summary.median, 3)} [${num(r.summary.q1, 3)} – ${num(r.summary.q3, 3)}]`);
    add("Range", `${num(r.summary.min, 3)} – ${num(r.summary.max, 3)}`);
    add("Skewness", num(r.summary.skewness, 3));
  }
  for (const f of r.frequencies || []) add(String(f.label), `${f.count.toLocaleString()} (${num(f.percent, 1)}%)`);
  for (const g of r.groups || []) add(`${g.group}`, `n = ${g.sampleSize}, mean ${num(g.mean, 3)} (SD ${num(g.standardDeviation, 3)}), median ${num(g.median, 3)}`);
  if (r.testStatistic) add(`Test statistic (${r.testStatistic.name})`, num(r.testStatistic.value, 4));
  if (r.degreesOfFreedom !== undefined && r.degreesOfFreedom !== null) add("Degrees of freedom", dfText(r.degreesOfFreedom));
  add("p-value", r.pValueDisplay);
  if (r.effectSize) add(`Effect size (${r.effectSize.name})`, num(r.effectSize.value, 4));
  if (r.meanDifference !== undefined) add("Mean difference", num(r.meanDifference, 4));
  if (r.confidenceInterval) add(`${Math.round((r.confidenceInterval.level ?? 0.95) * 100)}% confidence interval`, `${num(r.confidenceInterval.lower, 4)} – ${num(r.confidenceInterval.upper, 4)}`);
  if (r.coefficients) for (const [k, c] of Object.entries(r.coefficients)) add(`Coefficient: ${k}`, `${num(c.estimate, 4)}${c.standardError !== undefined ? ` (SE ${num(c.standardError, 4)})` : ""}`);
  if (r.rSquared !== undefined) add("R²", num(r.rSquared, 4));
  return rows;
}

/**
 * Completed analysis record to the workspace response. FAILED records are thrown as errors by the
 * adapter instead, so the workspace shows its retry notice.
 */
export function analysisToResponse(a, dataset) {
  const m = a.methodology || {};
  const disclosure = m.aiDisclosure;
  const headline = headlineFor(a);
  const r = a.results || {};
  // Coral marks the group with the highest mean only when the group difference is significant.
  const groupTest = a.analysisType === "ONE_WAY_ANOVA" || a.analysisType === "INDEPENDENT_T_TEST";
  const top = groupTest && isSig(r, m.alpha) ? [...(r.groups || [])].sort((x, y) => y.mean - x.mean)[0] : null;
  const explanation = a.interpretation
    ? [a.interpretation]
    : ["The written explanation was not available for this result, so only the computed statistics are shown. The limitations below still apply."];
  return {
    type: "analysis",
    analysisId: a.id,
    question: a.question,
    dataset: dataset ? { id: dataset.id, name: dataset.name } : { id: a.datasetId, name: "Dataset" },
    headline,
    explanation,
    evidence: [...toEvidence(a.visualizationData, { variables: m.variables, highlightGroup: top ? String(top.group) : null }), { kind: "stats", items: statsItems(a, headline) }].filter((e) => e.kind !== "stats" || e.items.length),
    interpretation: [],
    technical: {
      method: `${m.name || a.analysisType}.${disclosure?.rationale ? ` ${disclosure.rationale}` : ""} ${m.missingDataHandling ? `${m.missingDataHandling}.` : ""}`.trim(),
      results: technicalResults(a),
      assumptions: a.assumptions || [],
      limitations: [
        ...(a.limitations || []),
        ...(disclosure ? [`${disclosure.note} Sent to ${disclosure.provider}: ${lowerFirst(disclosure.dataSent)}`] : []),
      ],
    },
    // Next questions come from the dataset's own columns in the workspace, not from here.
    followUps: [],
    context: { analysisId: a.id },
  };
}

// ---------------------------------------------------------------------------
// Reports

/** Backend report (PDF) to the list entry the reports page shows. */
export function toReportEntry(rep, datasetName) {
  return {
    id: rep.id,
    pdf: true,
    title: rep.title,
    status: rep.status,
    analysisId: rep.analysisId,
    created: rep.createdAt,
    dataset: datasetName || null,
    sections: [],
  };
}

export const REPORT_REQUEST = /\b(report|write[- ]?up|pdf)\b/i;
