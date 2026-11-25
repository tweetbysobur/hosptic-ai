// Deterministic question matching. Finds column names mentioned in the
// question and picks a method from their types. Used when AI processing is
// off, and as a check on the AI's plan.
const { suggestTypeFor } = require("./plan");

const norm = (s) => ` ${String(s).toLowerCase().replace(/[_\-./]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
const ANALYSABLE = new Set(["numeric", "categorical", "boolean"]);

function mentionedColumns(question, profile) {
  const q = norm(question);
  const hits = [];
  for (const c of profile) {
    if (c.isSensitive || !ANALYSABLE.has(c.inferredType)) continue;
    const name = norm(c.columnName).trim();
    if (!name) continue;
    let pos = q.indexOf(` ${name} `);
    if (pos < 0) {
      // All words of a multi-word column name appear in the question.
      const words = name.split(" ").filter((w) => w.length > 2);
      if (words.length > 1 && words.every((w) => q.includes(` ${w} `))) pos = q.indexOf(` ${words[0]} `);
    }
    if (pos >= 0) hits.push({ col: c, pos, len: name.length });
  }
  // Drop matches contained inside a longer match ("age" inside "maternal age").
  return hits
    .filter((h) => !hits.some((o) => o !== h && o.len > h.len && o.pos <= h.pos && h.pos < o.pos + o.len + 1 && norm(o.col.columnName).includes(norm(h.col.columnName).trim())))
    .sort((a, b) => a.pos - b.pos)
    .map((h) => h.col);
}

function keywordPlan(question, profile) {
  const cols = mentionedColumns(question, profile);
  const q = norm(question);
  if (cols.length === 0 || cols.length > 2) {
    return {
      plan: null,
      reason:
        cols.length === 0
          ? "No column names from the dataset were found in the question."
          : `The question mentions ${cols.length} columns; name one or two.`,
    };
  }
  const [a, b] = cols;
  const isNum = (c) => c.inferredType === "numeric";
  let analysisType = suggestTypeFor(a, b);
  const variables = {};

  if (!b) {
    if (isNum(a) && /\b(distribution|histogram|spread|skew)/.test(q)) analysisType = "distribution";
    if (analysisType === "distribution") variables.outcome = a.columnName;
    else variables.columns = [a.columnName];
  } else if (isNum(a) && isNum(b)) {
    if (/\b(predict|regress|regression|model)/.test(q)) {
      analysisType = "linear_regression";
      // "predict X from Y" names the outcome first; "effect of Y on X" names the predictor first.
      const outcomeFirst = /\b(predict|model|regress)\w*\s.*\b(from|using|with|based on|by)\b/.test(q) || /\bregression of .* on\b/.test(q);
      variables.predictor = outcomeFirst ? b.columnName : a.columnName;
      variables.outcome = outcomeFirst ? a.columnName : b.columnName;
    } else if (/\b(before|after|paired|pre|post)\b/.test(q)) {
      analysisType = "paired_t_test";
      variables.columns = [a.columnName, b.columnName];
    } else {
      if (/\b(spearman|rank|ordinal|monotonic)/.test(q)) analysisType = "spearman_correlation";
      variables.columns = [a.columnName, b.columnName];
    }
  } else if (analysisType === "chi_square") {
    variables.columns = [a.columnName, b.columnName];
  } else {
    const num = isNum(a) ? a : b;
    const cat = isNum(a) ? b : a;
    variables.outcome = num.columnName;
    variables.group = cat.columnName;
  }
  return { plan: { analysisType, variables }, reason: `Matched column${b ? "s" : ""} ${cols.map((c) => `"${c.columnName}"`).join(" and ")} in the question.` };
}

module.exports = { keywordPlan, mentionedColumns };
