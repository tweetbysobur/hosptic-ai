const { getZaiClient } = require("./zai.client");
const { interpretationSchema } = require("./schemas");
const { buildInterpretationMessages } = require("./prompt-builder");

const ALLOWED_NUMBERS = [0, 0.05, 0.95, 0.001, 0.0001, 0.01, 1, 2, 3, 5, 10, 25, 50, 75, 95, 100];
const NUMBER_TOKEN = /-?\d+(?:\.\d+)?/g;

function collectNumbers(value, out = []) {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

/**
 * Checks the interpretation against the computed results:
 * 1. Every number in the text must come from the results or a small set of common values.
 * 2. "Statistically significant" must agree with the p-value and alpha.
 */
function validateInterpretation(text, analysis) {
  const allowed = [...collectNumbers(analysis.results), ...ALLOWED_NUMBERS];
  const numbers = (text.match(NUMBER_TOKEN) || []).map(Number);
  const unknown = numbers.filter((n) => !allowed.some((a) => Math.abs(a - n) <= Math.max(0.0051, Math.abs(a) * 0.01)));
  if (unknown.length > 0) {
    return { ok: false, reason: "The interpretation introduced numbers that are not in the results" };
  }

  const pValue = analysis.results.pValue;
  if (typeof pValue === "number") {
    const claimsSignificant = /(?<!not\s)(?<!no\s)statistically significant/i.test(text);
    const claimsNotSignificant = /(not|no)\s+statistically significant/i.test(text);
    if (pValue < 0.05 && claimsNotSignificant) return { ok: false, reason: "Significance claim contradicts the p-value" };
    if (pValue >= 0.05 && claimsSignificant) return { ok: false, reason: "Significance claim contradicts the p-value" };
  }
  if (/\b(causes?|caused|causal|proves?)\b/i.test(text)) {
    return { ok: false, reason: "The interpretation claims causation" };
  }
  return { ok: true };
}

/**
 * Returns a validated interpretation or null. A failed interpretation does not discard
 * the computed results. The caller records the reason as a limitation.
 */
async function interpretResults({ question, analysis }) {
  const client = getZaiClient();
  if (!client) return { text: null, reason: "AI interpretation is not configured" };
  const { system, user } = buildInterpretationMessages({ question, analysis });
  const raw = await client.completeJson({ system, user });
  const parsed = interpretationSchema.safeParse(raw);
  if (!parsed.success) return { text: null, reason: "The AI interpretation did not match the required structure" };
  const check = validateInterpretation(parsed.data.interpretation, analysis);
  if (!check.ok) return { text: null, reason: check.reason };
  return { text: parsed.data.interpretation, reason: null };
}

module.exports = { interpretResults, validateInterpretation, collectNumbers };
