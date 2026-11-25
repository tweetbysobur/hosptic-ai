const { getZaiClient } = require("./zai.client");
const { intentSchema } = require("./schemas");
const { buildColumnMetadata, buildIntentMessages } = require("./prompt-builder");
const { resolvePlan } = require("../analytics/planner");
const { AppError } = require("../utils/AppError");

/**
 * Asks Z.ai which method and columns fit the question. The result is validated against
 * the schema and the dataset before it is returned. The AI never runs the analysis.
 */
async function recommendAnalysis({ question, columns, table }) {
  const client = getZaiClient();
  if (!client) throw new AppError(503, "AI analysis is not configured on this server", "AI_NOT_CONFIGURED");

  const { system, user } = buildIntentMessages({ question, columns: buildColumnMetadata(columns, table) });
  const raw = await client.completeJson({ system, user });
  const parsed = intentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(502, "The AI recommendation did not match the required structure", "AI_INVALID_RESPONSE");
  }
  const plan = resolvePlan(parsed.data, columns);
  return { plan, rationale: parsed.data.rationale || null };
}

module.exports = { recommendAnalysis };
