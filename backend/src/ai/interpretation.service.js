// Asks Z.ai to explain already-computed results, then checks the answer
// against those results. Any number the engine did not produce, or wording
// that contradicts significance, rejects the AI text and the deterministic
// interpretation is used instead.
const { z } = require("zod");
const { chatJson } = require("./zai.client");
const { interpretationPrompt } = require("./prompt-builder");
const { interpret } = require("../analytics/interpret");

const schema = z.object({
  interpretation: z.string().min(20).max(3000),
  keyFindings: z.array(z.string().max(400)).max(6).default([]),
  caveats: z.array(z.string().max(400)).max(6).default([]),
});

// Numbers commonly used in statistical prose that do not come from the data.
const ALLOWED_CONSTANTS = [0.05, 0.01, 0.001, 5, 95, 1, 2, 3, 0, 100, 30, 1.5];

function collectNumbers(obj, out = []) {
  if (typeof obj === "number" && Number.isFinite(obj)) out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => collectNumbers(v, out));
  else if (obj && typeof obj === "object") Object.values(obj).forEach((v) => collectNumbers(v, out));
  return out;
}

function numberIsGrounded(n, sources) {
  if (ALLOWED_CONSTANTS.includes(n)) return true;
  const decimals = (String(n).split(".")[1] || "").length;
  const tol = 0.5 * 10 ** -decimals + 1e-9;
  return sources.some((s) => Math.abs(s - n) <= tol || Math.abs(s * 100 - n) <= tol || Math.abs(Math.abs(s) - n) <= tol);
}

function validateInterpretation(ai, analysis) {
  const text = [ai.interpretation, ...ai.keyFindings, ...ai.caveats].join(" ");
  const problems = [];
  const sources = collectNumbers(analysis.results);
  // Variable names may contain digits; strip them before scanning.
  let scan = text;
  for (const v of Object.values(analysis.methodology.variables || {}).flat()) {
    if (typeof v === "string") scan = scan.split(v).join(" ");
  }
  const found = (scan.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) || []).map((s) => Number(s.replace(/,/g, "")));
  const ungrounded = found.filter((n) => !numberIsGrounded(n, sources));
  if (ungrounded.length) problems.push(`numbers not in the computed results: ${[...new Set(ungrounded)].slice(0, 5).join(", ")}`);

  const sig = analysis.results.significantAtAlpha;
  if (typeof sig === "boolean") {
    const lower = text.toLowerCase();
    const claimsNot = /\bnot (statistically )?significant|\bno (statistically )?significant|\bnon-?significant|\binsignificant/.test(lower);
    const claimsSig = /(?<!not |no |non-?)\bstatistically significant/.test(lower.replace(/not statistically significant/g, ""));
    if (!sig && claimsSig) problems.push("claims significance the test did not show");
    if (sig && claimsNot && !claimsSig) problems.push("denies significance the test showed");
  }
  if (/\b(causes|caused by|leads to|results in)\b/i.test(text)) problems.push("makes a causal claim");
  return problems;
}

async function interpretWithAi({ question, analysis }) {
  const raw = await chatJson({ ...interpretationPrompt({ question, ...analysis }), maxTokens: 1200, temperature: 0.2 });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "AI interpretation had the wrong format" };
  const problems = validateInterpretation(parsed.data, analysis);
  if (problems.length) return { ok: false, reason: `AI interpretation rejected: ${problems.join("; ")}` };
  return { ok: true, ...parsed.data };
}

function deterministic(analysis) {
  return { interpretation: interpret(analysis), keyFindings: [], caveats: [] };
}

module.exports = { interpretWithAi, deterministic, validateInterpretation, numberIsGrounded };
