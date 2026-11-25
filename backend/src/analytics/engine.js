// Deterministic statistical engine. No AI output reaches this module except a validated plan.
const { toNumber, isMissing } = require("./columns");
const { summarise, modeOf, frequencyTable, histogram, round } = require("./descriptive");
const { independentTTest, pairedTTest, chiSquareTest, oneWayAnova } = require("./inferential");
const { pearsonCorrelation, spearmanCorrelation, linearRegression, ranks } = require("./correlation");
const { AnalysisError } = require("./errors");

const MAX_SCATTER_POINTS = 500;

const METHOD_NAMES = {
  DESCRIPTIVE: "Descriptive statistics",
  INDEPENDENT_T_TEST: "Welch's independent-samples t-test",
  PAIRED_T_TEST: "Paired-samples t-test",
  ONE_WAY_ANOVA: "One-way analysis of variance (ANOVA)",
  CHI_SQUARE: "Pearson chi-square test of independence",
  PEARSON_CORRELATION: "Pearson correlation",
  SPEARMAN_CORRELATION: "Spearman rank correlation",
  LINEAR_REGRESSION: "Simple linear regression (ordinary least squares)",
};

const COMMON_LIMITATIONS = [
  "Results use complete cases only. Rows with a missing value in an analysed variable are excluded.",
  "These statistics describe association in this dataset. They do not establish causation.",
  "Unmeasured confounding can affect every association in observational healthcare data.",
];

/** Reads a column as numbers and returns the values plus the number of rows dropped. */
function numericValues(table, name) {
  const raw = table.df.column(name).values;
  const values = [];
  let dropped = 0;
  for (const v of raw) {
    const n = isMissing(v) ? null : toNumber(String(v));
    if (n === null) dropped += 1;
    else values.push(n);
  }
  return { values, dropped };
}

/** Returns the labels of a column with missing rows removed. */
function labelValues(table, name) {
  return table.df.column(name).values.map((v) => (isMissing(v) ? null : String(v).trim()));
}

/** Pairs of values where every requested column is present and valid. */
function completePairs(table, a, b, typeA, typeB) {
  const va = table.df.column(a).values;
  const vb = table.df.column(b).values;
  const pairs = [];
  for (let i = 0; i < va.length; i += 1) {
    if (isMissing(va[i]) || isMissing(vb[i])) continue;
    const x = typeA === "NUMERIC" ? toNumber(String(va[i])) : String(va[i]).trim();
    const y = typeB === "NUMERIC" ? toNumber(String(vb[i])) : String(vb[i]).trim();
    if (x === null || y === null) continue;
    pairs.push([x, y]);
  }
  return pairs;
}

function scatterPoints(pairs) {
  return pairs.slice(0, MAX_SCATTER_POINTS).map(([x, y]) => ({ x: round(x), y: round(y) }));
}

function describeNumeric(table, name) {
  const { values, dropped } = numericValues(table, name);
  if (values.length === 0) throw new AnalysisError(`${name} has no valid numeric values`);
  return {
    results: {
      sampleSize: { valid: values.length, excludedMissingOrInvalid: dropped },
      summary: summarise(values),
      mode: round(modeOf(values)),
    },
    assumptions: [],
    visualizationData: { type: "histogram", variable: name, bins: histogram(values) },
  };
}

function describeCategorical(table, name) {
  const labels = labelValues(table, name).filter((l) => l !== null);
  if (labels.length === 0) throw new AnalysisError(`${name} has no valid values`);
  const frequencies = frequencyTable(labels);
  return {
    results: { sampleSize: { valid: labels.length }, frequencies, mode: frequencies[0].label },
    assumptions: [],
    visualizationData: { type: "bar", variable: name, categories: frequencies.map((f) => ({ label: f.label, count: f.count })) },
  };
}

function runGroupedNumeric(table, outcome, group) {
  const labels = labelValues(table, group);
  const outcomeRaw = table.df.column(outcome).values;
  const buckets = new Map();
  let excluded = 0;
  for (let i = 0; i < labels.length; i += 1) {
    const x = isMissing(outcomeRaw[i]) ? null : toNumber(String(outcomeRaw[i]));
    if (labels[i] === null || x === null) {
      excluded += 1;
      continue;
    }
    if (!buckets.has(labels[i])) buckets.set(labels[i], []);
    buckets.get(labels[i]).push(x);
  }
  return { buckets, excluded };
}

function groupsSummary(buckets) {
  return [...buckets.entries()].map(([label, values]) => ({ group: label, ...summarise(values) }));
}

function runIndependentT(table, plan) {
  const { buckets, excluded } = runGroupedNumeric(table, plan.variables.outcome, plan.variables.group);
  if (buckets.size !== 2) {
    throw new AnalysisError(`The t-test needs exactly 2 groups in "${plan.variables.group}". Found ${buckets.size}.`);
  }
  const [[labelA, a], [labelB, b]] = [...buckets.entries()];
  const out = independentTTest(a, b, [labelA, labelB]);
  return { ...out, excluded, visualizationData: { type: "groupSummary", variable: plan.variables.outcome, groups: groupsSummary(buckets) } };
}

function runAnova(table, plan) {
  const { buckets, excluded } = runGroupedNumeric(table, plan.variables.outcome, plan.variables.group);
  if (buckets.size < 2) throw new AnalysisError("ANOVA needs at least 2 groups");
  const groups = [...buckets.entries()].map(([label, values]) => ({ label, values }));
  const out = oneWayAnova(groups);
  return { ...out, excluded, visualizationData: { type: "groupSummary", variable: plan.variables.outcome, groups: groupsSummary(buckets) } };
}

function runPaired(table, plan) {
  const pairs = completePairs(table, plan.variables.outcome, plan.variables.pairedWith, "NUMERIC", "NUMERIC");
  const first = pairs.map((p) => p[0]);
  const second = pairs.map((p) => p[1]);
  const out = pairedTTest(first, second);
  const excluded = table.rowCount - pairs.length;
  const differences = first.map((v, i) => round(v - second[i]));
  return { ...out, excluded, visualizationData: { type: "histogram", variable: "paired differences", bins: histogram(differences) } };
}

function runChi(table, plan) {
  const pairs = completePairs(table, plan.variables.outcome, plan.variables.group, "CATEGORICAL", "CATEGORICAL");
  const out = chiSquareTest(pairs);
  const excluded = table.rowCount - pairs.length;
  const t = out.results.contingencyTable;
  return { ...out, excluded, visualizationData: { type: "heatmap", rows: t.rows, columns: t.columns, observed: t.observed } };
}

function runCorrelation(table, plan, method) {
  const pairs = completePairs(table, plan.variables.outcome, plan.variables.predictor, "NUMERIC", "NUMERIC");
  const x = pairs.map((p) => p[1]);
  const y = pairs.map((p) => p[0]);
  const fn = method === "SPEARMAN_CORRELATION" ? spearmanCorrelation : pearsonCorrelation;
  const out = fn(x, y);
  return {
    ...out,
    excluded: table.rowCount - pairs.length,
    visualizationData: { type: "scatter", x: plan.variables.predictor, y: plan.variables.outcome, points: scatterPoints(pairs) },
  };
}

function runRegression(table, plan) {
  const pairs = completePairs(table, plan.variables.outcome, plan.variables.predictor, "NUMERIC", "NUMERIC");
  const x = pairs.map((p) => p[1]);
  const y = pairs.map((p) => p[0]);
  const { fit, ...out } = linearRegression(x, y);
  const xs = x.slice(0, MAX_SCATTER_POINTS);
  return {
    ...out,
    excluded: table.rowCount - pairs.length,
    visualizationData: {
      type: "scatter",
      x: plan.variables.predictor,
      y: plan.variables.outcome,
      points: scatterPoints(pairs),
      fitLine: { slope: round(fit.slope), intercept: round(fit.intercept), xMin: round(Math.min(...xs)), xMax: round(Math.max(...xs)) },
    },
  };
}

/**
 * Executes a validated plan. Returns methodology, results, assumptions, limitations
 * and visualisation data. Throws AnalysisError when assumptions make the test invalid.
 */
function runAnalysis(plan, table, columns) {
  const { analysisType, variables } = plan;
  let output;
  switch (analysisType) {
    case "DESCRIPTIVE": {
      const column = columns.find((c) => c.columnName === variables.outcome);
      output = column && column.inferredType === "NUMERIC"
        ? describeNumeric(table, variables.outcome)
        : describeCategorical(table, variables.outcome);
      output.excluded = 0;
      break;
    }
    case "INDEPENDENT_T_TEST":
      output = runIndependentT(table, plan);
      break;
    case "PAIRED_T_TEST":
      output = runPaired(table, plan);
      break;
    case "ONE_WAY_ANOVA":
      output = runAnova(table, plan);
      break;
    case "CHI_SQUARE":
      output = runChi(table, plan);
      break;
    case "PEARSON_CORRELATION":
    case "SPEARMAN_CORRELATION":
      output = runCorrelation(table, plan, analysisType);
      break;
    case "LINEAR_REGRESSION":
      output = runRegression(table, plan);
      break;
    default:
      throw new AnalysisError(`Unsupported analysis type: ${analysisType}`);
  }

  const limitations = [...COMMON_LIMITATIONS];
  if (analysisType === "SPEARMAN_CORRELATION") limitations.push("Spearman p-values use a t approximation.");
  if (analysisType === "CHI_SQUARE") limitations.push("Chi-square p-values are approximate for sparse tables.");
  if (analysisType === "LINEAR_REGRESSION") limitations.push("Only one predictor is modelled. Confounders are not adjusted for.");

  return {
    analysisType,
    methodology: {
      name: METHOD_NAMES[analysisType],
      analysisType,
      variables,
      alpha: 0.05,
      missingDataHandling: "Complete-case analysis",
      excludedRows: output.excluded || 0,
    },
    results: output.results,
    assumptions: output.assumptions,
    limitations,
    visualizationData: output.visualizationData,
  };
}

module.exports = { runAnalysis, METHOD_NAMES, numericValues, labelValues, completePairs, ranks };
