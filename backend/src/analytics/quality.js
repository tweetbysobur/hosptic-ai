// Data quality report: finds problems and recommends specific cleaning
// operations the user can apply. It never changes the data itself.
const { isMissing, toNumber, parseDate, numericValues, numericSummary } = require("./profile");

const labelKey = (v) => String(v).trim().toLowerCase().replace(/\s+/g, " ");

function duplicateRows(rows) {
  const seen = new Set();
  let count = 0;
  for (const r of rows) {
    const key = JSON.stringify(r.map((v) => (isMissing(v) ? "" : String(v).trim())));
    if (seen.has(key)) count++;
    else seen.add(key);
  }
  return count;
}

function inconsistentLabels(values) {
  const groups = new Map();
  for (const v of values) {
    if (isMissing(v)) continue;
    const raw = String(v);
    const k = labelKey(raw);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k);
    g.set(raw, (g.get(raw) || 0) + 1);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.size > 1) {
      const variants = [...g.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
      out.push({ suggested: variants[0].value.trim(), variants });
    }
  }
  return out;
}

function dateIssues(values) {
  const formats = new Set();
  let unparseable = 0;
  let ambiguous = 0;
  let future = 0;
  const now = Date.now();
  for (const v of values) {
    if (isMissing(v)) continue;
    const s = String(v).trim();
    const pd = parseDate(s);
    if (!pd) {
      unparseable++;
      continue;
    }
    formats.add(pd.format);
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}$/);
    if (m && +m[1] <= 12 && +m[2] <= 12 && m[1] !== m[2]) ambiguous++;
    if (pd.date.getTime() > now) future++;
  }
  return { formats: [...formats], unparseable, ambiguous, future };
}

function analyseQuality(table, profile) {
  const { rows } = table;
  const issues = [];
  const recommendations = [];
  const totalCells = rows.length * table.columns.length;
  let missingCells = 0;

  const dupes = duplicateRows(rows);
  if (dupes > 0) {
    issues.push({ type: "duplicate_rows", severity: "warning", count: dupes, message: `${dupes} rows are exact duplicates of an earlier row.` });
    recommendations.push({ operation: { op: "drop_duplicates" }, reason: `Remove ${dupes} duplicate rows.` });
  }

  for (const col of profile) {
    const i = col.position;
    const values = rows.map((r) => r[i]);
    missingCells += col.missingCount;
    const name = col.columnName;

    if (col.missingCount > 0) {
      const share = col.missingCount / rows.length;
      issues.push({
        type: "missing_values",
        severity: share > 0.2 ? "warning" : "info",
        column: name,
        count: col.missingCount,
        share: Number(share.toFixed(4)),
        message: `${col.missingCount} of ${rows.length} values are missing in "${name}".`,
      });
      if (col.inferredType === "numeric") {
        recommendations.push({
          operation: { op: "fill_missing", column: name, strategy: "median" },
          reason: `Fill missing "${name}" with the median, or drop those rows if missingness may be related to the outcome.`,
        });
      } else if (share > 0.5) {
        recommendations.push({ operation: { op: "drop_columns", columns: [name] }, reason: `"${name}" is more than half empty.` });
      }
    }

    if (col.inferredType === "numeric" && col.metadata.invalidCount > 0) {
      const examples = [...new Set(values.filter((v) => !isMissing(v) && !Number.isFinite(toNumber(v))).map(String))].slice(0, 5);
      issues.push({
        type: "invalid_numeric",
        severity: "warning",
        column: name,
        count: col.metadata.invalidCount,
        examples: col.isSensitive ? [] : examples,
        message: `${col.metadata.invalidCount} values in numeric column "${name}" are not numbers.`,
      });
      recommendations.push({ operation: { op: "coerce_numeric", column: name }, reason: `Treat non-numeric entries in "${name}" as missing.` });
    }

    if (col.inferredType === "numeric") {
      const summary = numericSummary(numericValues(rows, i));
      if (summary && summary.outlierCount > 0) {
        issues.push({
          type: "potential_outliers",
          severity: "info",
          column: name,
          count: summary.outlierCount,
          fences: summary.outlierFences,
          message: `${summary.outlierCount} values in "${name}" fall outside 1.5 x IQR. Check them before removing; they may be real.`,
        });
      }
      if (summary && summary.min < 0 && /age|weight|height|count|visits|stay|days|bmi|parity/i.test(name)) {
        issues.push({ type: "implausible_values", severity: "warning", column: name, message: `"${name}" has negative values.` });
      }
    }

    if (["categorical", "boolean"].includes(col.inferredType)) {
      const groups = inconsistentLabels(values);
      if (groups.length) {
        issues.push({
          type: "inconsistent_labels",
          severity: "warning",
          column: name,
          count: groups.length,
          groups: col.isSensitive ? [] : groups.slice(0, 10),
          message: `"${name}" has ${groups.length} labels written in more than one way (case or spacing).`,
        });
        recommendations.push({ operation: { op: "standardize_labels", column: name }, reason: `Merge label variants in "${name}".` });
      }
    }

    if (col.inferredType === "date") {
      const d = dateIssues(values);
      if (d.formats.length > 1 || d.unparseable || d.ambiguous || d.future) {
        issues.push({
          type: "inconsistent_dates",
          severity: "warning",
          column: name,
          formats: d.formats,
          unparseable: d.unparseable,
          ambiguousDayMonth: d.ambiguous,
          futureDates: d.future,
          message: `"${name}" mixes date formats or has unreadable, ambiguous or future dates.`,
        });
        recommendations.push({
          operation: { op: "parse_dates", column: name, dayFirst: true },
          reason: `Convert "${name}" to YYYY-MM-DD. Confirm whether dates are day-first before applying.`,
        });
      }
    }

    if (col.inferredType === "text" || col.inferredType === "identifier") {
      const sample = values.filter((v) => !isMissing(v)).slice(0, 200);
      const numericShare = sample.filter((v) => Number.isFinite(toNumber(v))).length / (sample.length || 1);
      if (numericShare > 0.5) {
        issues.push({
          type: "unexpected_type",
          severity: "warning",
          column: name,
          message: `"${name}" is mostly numbers but contains text, so it is treated as text.`,
        });
        recommendations.push({ operation: { op: "coerce_numeric", column: name }, reason: `Convert "${name}" to numbers.` });
      }
    }

    if (col.isSensitive) {
      issues.push({
        type: "possible_identifier",
        severity: "info",
        column: name,
        message: `"${name}" looks like a patient identifier. It is excluded from AI processing and statistical analysis.`,
      });
    }

    if (col.inferredType === "empty") {
      recommendations.push({ operation: { op: "drop_columns", columns: [name] }, reason: `"${name}" has no values.` });
    }
  }

  if (table.warnings?.raggedRows) {
    issues.push({
      type: "ragged_rows",
      severity: "warning",
      count: table.warnings.raggedRows,
      message: `${table.warnings.raggedRows} rows have a different number of fields than the header.`,
    });
  }

  const warnings = issues.filter((i) => i.severity === "warning").length;
  return {
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    columnCount: table.columns.length,
    duplicateRows: dupes,
    missingCells,
    completeness: totalCells ? Number((1 - missingCells / totalCells).toFixed(4)) : 0,
    warningCount: warnings,
    issues,
    recommendations,
    renamedHeaders: table.warnings?.renamedHeaders || [],
  };
}

module.exports = { analyseQuality, duplicateRows, inconsistentLabels, labelKey };
