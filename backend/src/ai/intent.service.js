// Turns a natural-language question into a validated analysis plan.
// Z.ai proposes; the deterministic validator decides. The AI never touches
// data or runs anything.
const { z } = require("zod");
const { chatJson } = require("./zai.client");
const { intentPrompt, columnMetadata } = require("./prompt-builder");
const { ANALYSIS_TYPES, validatePlan, suggestTypeFor } = require("../analytics/plan");
const { keywordPlan } = require("../analytics/keyword-planner");
const { unprocessable } = require("../utils/errors");

const str = z.string().max(120);
const aiIntentSchema = z.object({
  status: z.enum(["ok", "needs_clarification", "unsupported"]),
  analysisType: z.enum(ANALYSIS_TYPES).nullable().optional(),
  variables: z
    .object({ outcome: str.nullish(), predictor: str.nullish(), group: str.nullish(), columns: z.array(str).max(10).nullish() })
    .partial()
    .nullish(),
  groupLevels: z.array(z.string().max(200)).length(2).nullish(),
  rationale: z.string().max(1200).default(""),
  clarificationQuestion: z.string().max(500).nullish(),
});

const stripNulls = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined));

// If the AI picked a method that does not fit the column types, fall back to
// the method the types dictate, using the same columns.
function repairPlan(proposed, profile) {
  const names = [proposed.variables.outcome, proposed.variables.predictor, proposed.variables.group, ...(proposed.variables.columns || [])].filter(Boolean);
  const cols = [...new Set(names)].map((n) => profile.find((c) => c.columnName === n)).filter((c) => c && !c.isSensitive);
  if (cols.length < 1 || cols.length > 2) return null;
  const [a, b] = cols;
  const type = suggestTypeFor(a, b);
  const variables = {};
  if (!b) variables.columns = [a.columnName];
  else if (type === "chi_square" || type === "pearson_correlation") variables.columns = [a.columnName, b.columnName];
  else {
    const num = a.inferredType === "numeric" ? a : b;
    const cat = num === a ? b : a;
    variables.outcome = num.columnName;
    variables.group = cat.columnName;
  }
  return { analysisType: type, variables };
}

async function planWithAi(question, profile, rowCount) {
  const raw = await chatJson({ ...intentPrompt(question, columnMetadata(profile, rowCount)), maxTokens: 800 });
  const parsed = aiIntentSchema.safeParse(raw);
  if (!parsed.success) throw unprocessable("The AI returned an invalid analysis plan");
  const ai = parsed.data;
  if (ai.status === "needs_clarification") {
    throw unprocessable(ai.clarificationQuestion || "The question is ambiguous. Name the columns to compare.", { needsClarification: true, rationale: ai.rationale });
  }
  if (ai.status === "unsupported" || !ai.analysisType) {
    throw unprocessable(ai.rationale || "This question cannot be answered with the columns in this dataset.", { unsupported: true });
  }

  const proposed = { analysisType: ai.analysisType, variables: stripNulls(ai.variables), ...(ai.groupLevels ? { groupLevels: ai.groupLevels } : {}) };
  try {
    const { plan, notes } = validatePlan(proposed, profile);
    return { plan, notes, rationale: ai.rationale, source: "zai" };
  } catch (err) {
    const repaired = repairPlan(proposed, profile);
    if (!repaired) throw err;
    const { plan, notes } = validatePlan(repaired, profile);
    return {
      plan,
      notes: [`The AI suggested ${proposed.analysisType.replace(/_/g, " ")}, which does not fit these column types (${err.message}). ${plan.analysisType.replace(/_/g, " ")} was used instead.`, ...notes],
      rationale: ai.rationale,
      source: "zai_corrected",
    };
  }
}

function planWithKeywords(question, profile) {
  const { plan, reason } = keywordPlan(question, profile);
  if (!plan) {
    throw unprocessable(
      `${reason} With AI processing off, mention the exact column names in your question or send an explicit plan.`,
      { availableColumns: profile.filter((c) => !c.isSensitive).map((c) => c.columnName) }
    );
  }
  const { plan: valid, notes } = validatePlan(plan, profile);
  return { plan: valid, notes, rationale: reason, source: "keyword_match" };
}

module.exports = { planWithAi, planWithKeywords, aiIntentSchema, repairPlan };
