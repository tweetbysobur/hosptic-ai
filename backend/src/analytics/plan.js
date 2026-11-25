// Analysis plans: the contract between question understanding (AI or user)
// and the statistics engine. A plan is only data. It is validated against the
// dataset's real column profile before anything runs.
const { z } = require("zod");
const { unprocessable } = require("../utils/errors");

const ANALYSIS_TYPES = [
  "descriptive",
  "frequency",
  "distribution",
  "independent_t_test",
  "paired_t_test",
  "one_way_anova",
  "chi_square",
  "pearson_correlation",
  "spearman_correlation",
  "linear_regression",
];

const name = z.string().min(1).max(120);

const planSchema = z
  .object({
    analysisType: z.enum(ANALYSIS_TYPES),
    variables: z
      .object({
        outcome: name.optional(),
        predictor: name.optional(),
        group: name.optional(),
        columns: z.array(name).max(10).optional(),
      })
      .strict(),
    groupLevels: z.array(z.string().max(200)).length(2).optional(),
  })
  .strict();

const NUMERIC = ["numeric"];
const CATEGORICAL = ["categorical", "boolean"];
const MAX_LEVELS = 20;

function needColumn(profile, col, allowed, role) {
  const p = profile.get(col);
  const available = [...profile.values()]
    .filter((c) => !c.isSensitive && [...NUMERIC, ...CATEGORICAL].includes(c.inferredType))
    .map((c) => `${c.columnName} (${c.inferredType})`);
  if (!col) throw unprocessable(`The ${role} variable is missing from the plan`, { availableColumns: available });
  if (!p) throw unprocessable(`Column "${col}" does not exist in this dataset`, { availableColumns: available });
  if (p.isSensitive) throw unprocessable(`Column "${col}" looks like a patient identifier and cannot be analysed`);
  if (!allowed.includes(p.inferredType)) {
    throw unprocessable(
      `Column "${col}" is ${p.inferredType}, but the ${role} must be ${allowed.join(" or ")}`,
      { availableColumns: available }
    );
  }
  return p;
}

const levelCount = (p) => p.metadata?.levels?.length ?? p.uniqueCount;

// Returns { plan, notes }. Corrects the method only when the variables make
// the right choice unambiguous, and records the correction in notes.
function validatePlan(input, profileList) {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    throw unprocessable("The analysis plan is invalid", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const plan = structuredClone(parsed.data);
  const profile = new Map(profileList.map((c) => [c.columnName, c]));
  const v = plan.variables;
  const notes = [];

  switch (plan.analysisType) {
    case "descriptive": {
      const cols = v.columns?.length ? v.columns : [v.outcome].filter(Boolean);
      if (!cols.length) throw unprocessable("Choose at least one column to describe");
      cols.forEach((c) => needColumn(profile, c, [...NUMERIC, ...CATEGORICAL], "described"));
      v.columns = cols;
      break;
    }
    case "frequency": {
      const cols = v.columns?.length ? v.columns : [v.outcome].filter(Boolean);
      if (!cols.length) throw unprocessable("Choose a categorical column");
      cols.forEach((c) => needColumn(profile, c, CATEGORICAL, "frequency"));
      v.columns = cols.slice(0, 5);
      break;
    }
    case "distribution":
      needColumn(profile, v.outcome || v.columns?.[0], NUMERIC, "distribution");
      v.outcome = v.outcome || v.columns[0];
      break;
    case "independent_t_test":
    case "one_way_anova": {
      needColumn(profile, v.outcome, NUMERIC, "outcome");
      const g = needColumn(profile, v.group, CATEGORICAL, "grouping");
      const k = levelCount(g);
      if (plan.groupLevels) {
        if (plan.analysisType !== "independent_t_test") delete plan.groupLevels;
        break;
      }
      if (k < 2) throw unprocessable(`"${v.group}" has only one group, so there is nothing to compare`);
      if (k > MAX_LEVELS) throw unprocessable(`"${v.group}" has ${k} groups. The limit is ${MAX_LEVELS}`);
      if (plan.analysisType === "independent_t_test" && k > 2) {
        plan.analysisType = "one_way_anova";
        notes.push(`"${v.group}" has ${k} groups, so one-way ANOVA was used instead of a t-test.`);
      } else if (plan.analysisType === "one_way_anova" && k === 2) {
        plan.analysisType = "independent_t_test";
        notes.push(`"${v.group}" has 2 groups, so a t-test was used instead of ANOVA.`);
      }
      break;
    }
    case "paired_t_test": {
      const cols = v.columns?.length === 2 ? v.columns : [v.outcome, v.predictor];
      cols.forEach((c, i) => needColumn(profile, c, NUMERIC, i ? "second measurement" : "first measurement"));
      v.columns = cols;
      notes.push("A paired test assumes both columns are measurements of the same patient (for example before and after).");
      break;
    }
    case "chi_square": {
      const cols = v.columns?.length === 2 ? v.columns : [v.outcome, v.group || v.predictor];
      const ps = cols.map((c, i) => needColumn(profile, c, CATEGORICAL, i ? "second categorical" : "first categorical"));
      ps.forEach((p) => {
        if (levelCount(p) > MAX_LEVELS) throw unprocessable(`"${p.columnName}" has too many categories for a chi-square test`);
      });
      if (cols[0] === cols[1]) throw unprocessable("Choose two different columns");
      v.columns = cols;
      break;
    }
    case "pearson_correlation":
    case "spearman_correlation":
    case "linear_regression": {
      const cols =
        plan.analysisType === "linear_regression"
          ? [v.predictor || v.columns?.[0], v.outcome || v.columns?.[1]]
          : v.columns?.length === 2
            ? v.columns
            : [v.predictor, v.outcome];
      cols.forEach((c, i) => needColumn(profile, c, NUMERIC, i ? "outcome" : "predictor"));
      if (cols[0] === cols[1]) throw unprocessable("Choose two different columns");
      if (plan.analysisType === "linear_regression") {
        v.predictor = cols[0];
        v.outcome = cols[1];
      } else v.columns = cols;
      break;
    }
    default:
      throw unprocessable("Unsupported analysis type");
  }
  return { plan, notes };
}

// Deterministic method choice from column types, used to check or replace an
// AI recommendation.
function suggestTypeFor(colA, colB) {
  const num = (c) => NUMERIC.includes(c.inferredType);
  const cat = (c) => CATEGORICAL.includes(c.inferredType);
  if (!colB) return num(colA) ? "descriptive" : "frequency";
  if (num(colA) && num(colB)) return "pearson_correlation";
  if (cat(colA) && cat(colB)) return "chi_square";
  const group = cat(colA) ? colA : colB;
  return levelCount(group) === 2 ? "independent_t_test" : "one_way_anova";
}

module.exports = { ANALYSIS_TYPES, planSchema, validatePlan, suggestTypeFor };
