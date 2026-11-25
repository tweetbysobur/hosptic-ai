// Validates an AI recommendation before any statistic is computed.
// The AI proposes a method and column names. This module decides whether they are allowed.
const { unprocessable } = require("../utils/AppError");

const ANALYSIS_TYPES = Object.freeze({
  DESCRIPTIVE: { outcome: ["NUMERIC", "CATEGORICAL", "BOOLEAN"] },
  INDEPENDENT_T_TEST: { outcome: ["NUMERIC"], group: ["CATEGORICAL", "BOOLEAN"] },
  PAIRED_T_TEST: { outcome: ["NUMERIC"], pairedWith: ["NUMERIC"] },
  ONE_WAY_ANOVA: { outcome: ["NUMERIC"], group: ["CATEGORICAL", "BOOLEAN"] },
  CHI_SQUARE: { outcome: ["CATEGORICAL", "BOOLEAN"], group: ["CATEGORICAL", "BOOLEAN"] },
  PEARSON_CORRELATION: { outcome: ["NUMERIC"], predictor: ["NUMERIC"] },
  SPEARMAN_CORRELATION: { outcome: ["NUMERIC"], predictor: ["NUMERIC"] },
  LINEAR_REGRESSION: { outcome: ["NUMERIC"], predictor: ["NUMERIC"] },
});

const ANALYSIS_TYPE_NAMES = Object.freeze(Object.keys(ANALYSIS_TYPES));
const VARIABLE_ROLES = Object.freeze(["outcome", "group", "predictor", "pairedWith"]);

function resolveColumn(name, columns) {
  if (typeof name !== "string") return null;
  const wanted = name.trim().toLowerCase();
  return columns.find((c) => c.columnName.trim().toLowerCase() === wanted) || null;
}

/**
 * Returns a plan with canonical column names. Throws 422 when the plan breaks a rule.
 * Rules: columns must exist, must not be sensitive, must match the required type for their role.
 */
function resolvePlan(recommendation, columns) {
  const { analysisType, variables } = recommendation;
  const requirements = ANALYSIS_TYPES[analysisType];
  if (!requirements) {
    throw unprocessable(`The analysis type ${analysisType} is not supported`);
  }

  const resolved = {};
  for (const role of Object.keys(requirements)) {
    const column = resolveColumn(variables[role], columns);
    if (!column) {
      throw unprocessable(`The ${role} variable "${variables[role] ?? ""}" does not match a column in the dataset`);
    }
    if (column.isSensitive) {
      throw unprocessable(`Column "${column.columnName}" contains personal data and cannot be used in analysis`);
    }
    if (!requirements[role].includes(column.inferredType)) {
      throw unprocessable(
        `${analysisType} needs the ${role} variable to be one of ${requirements[role].join(", ")}. "${column.columnName}" is ${column.inferredType}.`
      );
    }
    resolved[role] = column.columnName;
  }

  const unexpected = Object.keys(variables).filter((k) => !VARIABLE_ROLES.includes(k) || (!requirements[k] && variables[k]));
  if (unexpected.length > 0) {
    throw unprocessable(`Unexpected variable roles for ${analysisType}: ${unexpected.join(", ")}`);
  }
  if (resolved.outcome && resolved.group && resolved.outcome === resolved.group) {
    throw unprocessable("The outcome and group variables must be different columns");
  }
  return { analysisType, variables: resolved };
}

module.exports = { ANALYSIS_TYPES, ANALYSIS_TYPE_NAMES, resolvePlan, resolveColumn };
