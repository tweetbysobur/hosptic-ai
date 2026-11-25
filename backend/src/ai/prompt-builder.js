// Builds the minimum payloads sent to Z.ai. Raw rows are never included.
// Identifier columns are dropped entirely, and obvious personal details are
// redacted from the user's question.

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE = /\+?\d[\d\s()-]{8,}\d/g;
const LONG_ID = /\b[A-Z]{0,4}\d{6,}\b/gi;

function redactQuestion(q) {
  return String(q).replace(EMAIL, "[email]").replace(PHONE, "[number]").replace(LONG_ID, "[id]").slice(0, 1000);
}

const ANALYSABLE = new Set(["numeric", "categorical", "boolean"]);

// Column metadata for the intent prompt. Only analysable, non-identifier columns.
function columnMetadata(columns, rowCount) {
  return {
    rowCount,
    columns: columns
      .filter((c) => !c.isSensitive && ANALYSABLE.has(c.inferredType))
      .map((c) => ({
        name: c.columnName,
        type: c.inferredType,
        missing: c.missingCount,
        distinctValues: c.uniqueCount,
        ...(c.inferredType !== "numeric" && c.metadata?.levels
          ? { categories: c.metadata.levels.slice(0, 20).map((l) => String(l.value).slice(0, 40)) }
          : {}),
        ...(c.inferredType === "numeric" && c.metadata?.summary
          ? { range: [c.metadata.summary.min, c.metadata.summary.max] }
          : {}),
      })),
  };
}

const INTENT_SYSTEM = `You are the question-understanding step of a hospital statistics tool.
You never calculate statistics. You only choose a method and variables from the column list.
Reply with one JSON object and nothing else:
{
  "status": "ok" | "needs_clarification" | "unsupported",
  "analysisType": "descriptive" | "frequency" | "distribution" | "independent_t_test" | "paired_t_test" | "one_way_anova" | "chi_square" | "pearson_correlation" | "spearman_correlation" | "linear_regression" | null,
  "variables": { "outcome": string?, "predictor": string?, "group": string?, "columns": string[]? },
  "groupLevels": [string, string]?,
  "rationale": string,
  "clarificationQuestion": string?
}
Rules:
- Use only exact column names from the list. Never invent columns.
- numeric outcome by 2-category group: independent_t_test (outcome, group).
- numeric outcome by 3+ category group: one_way_anova (outcome, group).
- two categorical columns: chi_square (columns: [a, b]).
- two numeric columns: pearson_correlation (columns: [x, y]); spearman_correlation if the user asks for ranks or data are ordinal; linear_regression if the user asks to predict or model one from the other (predictor, outcome).
- two numeric columns measured on the same patient (before/after): paired_t_test (columns: [first, second]).
- one column: descriptive, frequency (categorical) or distribution (numeric).
- If the question cannot be answered with these columns, use status "unsupported" and explain in rationale.
- If it is ambiguous, use status "needs_clarification" with one short clarificationQuestion.
- rationale: one or two plain sentences, no numbers about the data.`;

function intentPrompt(question, metadata) {
  return {
    system: INTENT_SYSTEM,
    user: JSON.stringify({ question: redactQuestion(question), dataset: metadata }),
  };
}

// Strips large or row-level arrays before results are sent for interpretation.
function compactResults(results) {
  const drop = new Set(["residuals", "points", "diffs", "expected", "histogram", "bins"]);
  const walk = (v) => {
    if (Array.isArray(v)) return v.length > 40 ? v.slice(0, 40).map(walk) : v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).filter(([k]) => !drop.has(k)).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(results);
}

const INTERPRET_SYSTEM = `You explain verified statistical results to hospital staff in plain English.
All numbers were calculated by a separate statistics engine. You must not calculate, estimate or invent any number.
Only use numbers that appear in the results you are given, rounded sensibly.
Use "statistically significant" only if significantAtAlpha is true. If it is false, say the result is not statistically significant.
Never claim causation. Mention the most important assumption problem if any assumption is "violated".
Reply with one JSON object and nothing else:
{ "interpretation": string (3 to 6 sentences), "keyFindings": string[] (at most 4), "caveats": string[] (at most 4) }`;

function interpretationPrompt({ question, methodology, results, assumptions, limitations }) {
  return {
    system: INTERPRET_SYSTEM,
    user: JSON.stringify({
      question: redactQuestion(question),
      method: methodology.test,
      variables: methodology.variables,
      alpha: methodology.alpha,
      preferredResult: methodology.preferredResult,
      results: compactResults(results),
      assumptions,
      limitations,
    }),
  };
}

module.exports = { redactQuestion, columnMetadata, intentPrompt, interpretationPrompt, compactResults };
