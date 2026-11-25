// Builds prompts with data minimisation. The model receives column metadata and aggregate
// statistics only. Row values, identifiers and sensitive columns are never included.
const { isMissing } = require("../analytics/columns");

const MAX_LEVELS = 15;

function buildColumnMetadata(columns, table) {
  return columns
    .filter((c) => !c.isSensitive)
    .map((c) => {
      const entry = {
        name: c.columnName,
        type: c.inferredType,
        missingPct: table.rowCount ? Number(((c.missingCount / table.rowCount) * 100).toFixed(1)) : 0,
        uniqueCount: c.uniqueCount,
      };
      if (c.inferredType === "CATEGORICAL" || c.inferredType === "BOOLEAN") {
        const levels = [...new Set(table.df.column(c.columnName).values.filter((v) => !isMissing(v)).map((v) => String(v).trim()))];
        if (levels.length <= MAX_LEVELS) entry.levels = levels.sort();
      }
      return entry;
    });
}

function buildIntentMessages({ question, columns }) {
  const system = [
    "You are a statistical method selector for hospital data.",
    "Choose exactly one analysisType from: " + INTENT_TYPES.join(", ") + ".",
    "Map the question to column names from the provided list only. Never invent a column.",
    "Required variable roles:",
    "DESCRIPTIVE: outcome.",
    "INDEPENDENT_T_TEST, ONE_WAY_ANOVA: outcome (NUMERIC) and group (CATEGORICAL or BOOLEAN).",
    "PAIRED_T_TEST: outcome and pairedWith (both NUMERIC).",
    "CHI_SQUARE: outcome and group (both CATEGORICAL or BOOLEAN).",
    "PEARSON_CORRELATION, SPEARMAN_CORRELATION, LINEAR_REGRESSION: outcome (NUMERIC) and predictor (NUMERIC).",
    "Do not calculate anything. Do not explain the statistics.",
    'Reply with JSON only: {"analysisType": "...", "variables": {"outcome": "...", "group": "...", "predictor": "...", "pairedWith": "..."}, "rationale": "one short sentence"}.',
    "Include only the variable roles the chosen analysisType needs.",
  ].join("\n");
  const user = JSON.stringify({ question, columns });
  return { system, user };
}

function buildInterpretationMessages({ question, analysis }) {
  const system = [
    "You explain verified statistical results to hospital staff in plain language.",
    "Use only the numbers provided. Do not introduce any new number.",
    "If pValueDisplay is present, quote it instead of pValue. Never write p = 0.",
    "Do not claim causation. State whether the result is statistically significant at alpha 0.05 only if pValue is provided.",
    "Mention the main assumption or limitation that affects the result.",
    'Reply with JSON only: {"interpretation": "two to five sentences"}.',
  ].join("\n");
  const user = JSON.stringify({
    question,
    method: analysis.methodology.name,
    alpha: analysis.methodology.alpha,
    results: analysis.results,
    assumptions: analysis.assumptions,
    limitations: analysis.limitations,
  });
  return { system, user };
}

const INTENT_TYPES = [
  "DESCRIPTIVE",
  "INDEPENDENT_T_TEST",
  "PAIRED_T_TEST",
  "ONE_WAY_ANOVA",
  "CHI_SQUARE",
  "PEARSON_CORRELATION",
  "SPEARMAN_CORRELATION",
  "LINEAR_REGRESSION",
];

module.exports = { buildColumnMetadata, buildIntentMessages, buildInterpretationMessages, INTENT_TYPES };
