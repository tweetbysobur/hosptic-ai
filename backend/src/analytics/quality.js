const { quantileSorted } = require("simple-statistics");
const { isMissing, toNumber, dateFormat, inferColumn } = require("./columns");

const MAX_GROUPS_REPORTED = 20;

const normaliseLabel = (value) =>
  String(value).toLowerCase().replace(/[\s_\-.]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();

function iqrOutliers(numbers) {
  if (numbers.length < 4) return { count: 0, lower: null, upper: null };
  const sorted = [...numbers].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const count = numbers.filter((n) => n < lower || n > upper).length;
  return { count, lower, upper };
}

function profileColumn(name, values, base) {
  const present = values.filter((v) => !isMissing(v)).map((v) => String(v).trim());
  const missingPct = values.length ? (base.missingCount / values.length) * 100 : 0;
  const entry = {
    name,
    inferredType: base.inferredType,
    missingCount: base.missingCount,
    missingPct: Number(missingPct.toFixed(2)),
    uniqueCount: base.uniqueCount,
    isSensitive: base.isSensitive,
    invalidValues: 0,
    outliers: null,
    dateFormats: null,
    labelVariants: null,
  };

  if (base.inferredType === "NUMERIC") {
    const numbers = present.map(toNumber).filter((n) => n !== null);
    entry.invalidValues = present.length - numbers.length;
    entry.outliers = iqrOutliers(numbers);
  } else if (base.inferredType === "DATE") {
    const formats = {};
    let invalid = 0;
    for (const value of present) {
      const format = dateFormat(value);
      if (format === "INVALID" || format === null) invalid += 1;
      else formats[format] = (formats[format] || 0) + 1;
    }
    entry.dateFormats = formats;
    entry.invalidValues = invalid;
  }
  if (base.inferredType === "CATEGORICAL" || base.inferredType === "BOOLEAN") {
    const byKey = new Map();
    for (const value of new Set(present)) {
      const key = normaliseLabel(value);
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(value);
    }
    const variants = [...byKey.values()].filter((set) => set.size > 1).map((set) => [...set]);
    entry.labelVariants = variants.slice(0, MAX_GROUPS_REPORTED);
  }
  // Columns that are mostly numeric but not numeric enough to be typed NUMERIC.
  if (base.inferredType !== "NUMERIC" && base.inferredType !== "EMPTY") {
    const numericCount = present.filter((v) => toNumber(v) !== null).length;
    if (present.length > 0 && numericCount / present.length >= 0.5 && numericCount < present.length) {
      entry.invalidValues = present.length - numericCount;
      entry.mixedNumeric = true;
    }
  }
  return entry;
}

/**
 * Builds the data quality report from parsed columns.
 * Every figure is computed directly from the file. The AI never produces these values.
 */
function buildQualityReport(table, columns) {
  const { headers, df, rowCount, malformedRows } = table;
  const columnValues = Object.fromEntries(headers.map((h) => [h, df.column(h).values]));

  const seen = new Set();
  let duplicateRows = 0;
  for (let r = 0; r < rowCount; r += 1) {
    const key = JSON.stringify(headers.map((h) => (columnValues[h][r] === null ? null : String(columnValues[h][r]).trim())));
    if (seen.has(key)) duplicateRows += 1;
    else seen.add(key);
  }

  const profiles = columns.map((col) => profileColumn(col.columnName, columnValues[col.columnName], col));
  const issues = [];
  const recommendations = [];

  if (malformedRows > 0) {
    issues.push({ severity: "warning", code: "MALFORMED_ROWS", message: `${malformedRows} rows have a different number of fields than the header` });
    recommendations.push("Check rows with a different field count. Fix delimiter or quoting errors before analysis.");
  }
  if (duplicateRows > 0) {
    issues.push({ severity: "warning", code: "DUPLICATE_ROWS", message: `${duplicateRows} rows duplicate an earlier row exactly` });
    recommendations.push("Confirm whether duplicate rows are repeated records. Remove them only if they are data-entry duplicates.");
  }

  for (const p of profiles) {
    if (p.missingPct >= 50) {
      issues.push({ severity: "critical", code: "HIGH_MISSINGNESS", column: p.name, message: `${p.name} is ${p.missingPct}% missing` });
      recommendations.push(`Consider excluding ${p.name} from analysis. More than half of its values are missing.`);
    } else if (p.missingPct >= 20) {
      issues.push({ severity: "warning", code: "MISSING_VALUES", column: p.name, message: `${p.name} is ${p.missingPct}% missing` });
      recommendations.push(`Document how missing values in ${p.name} are handled. Analyses use complete cases only.`);
    } else if (p.missingCount > 0) {
      issues.push({ severity: "info", code: "MISSING_VALUES", column: p.name, message: `${p.name} has ${p.missingCount} missing values` });
    }

    if ((p.inferredType === "NUMERIC" || p.mixedNumeric) && p.invalidValues > 0) {
      issues.push({ severity: "critical", code: "INVALID_NUMERIC", column: p.name, message: `${p.name} has ${p.invalidValues} non-numeric values in a numeric column` });
      recommendations.push(`Correct or remove non-numeric entries in ${p.name} before analysis.`);
    }
    if (p.inferredType === "NUMERIC" && p.outliers && p.outliers.count > 0) {
      issues.push({ severity: "info", code: "POTENTIAL_OUTLIERS", column: p.name, message: `${p.name} has ${p.outliers.count} values outside the 1.5 IQR range` });
      recommendations.push(`Review potential outliers in ${p.name}. Confirm they are valid measurements.`);
    }
    if (p.inferredType === "DATE" && (p.invalidValues > 0 || Object.keys(p.dateFormats || {}).length > 1)) {
      issues.push({ severity: "warning", code: "INCONSISTENT_DATES", column: p.name, message: `${p.name} mixes date formats or contains invalid dates` });
      recommendations.push(`Convert ${p.name} to one date format (ISO 8601: YYYY-MM-DD).`);
    }
    if (p.labelVariants && p.labelVariants.length > 0) {
      issues.push({ severity: "warning", code: "INCONSISTENT_LABELS", column: p.name, message: `${p.name} has ${p.labelVariants.length} groups of labels that differ only in spelling or case` });
      recommendations.push(`Standardise category labels in ${p.name} (for example ${p.labelVariants[0].join(" / ")}).`);
    }
    if (p.isSensitive) {
      issues.push({ severity: "info", code: "SENSITIVE_COLUMN", column: p.name, message: `${p.name} looks like personal or identifying data and is masked` });
      recommendations.push(`Remove ${p.name} from the dataset if the analysis does not need it.`);
    }
    if (p.inferredType === "EMPTY") {
      issues.push({ severity: "warning", code: "EMPTY_COLUMN", column: p.name, message: `${p.name} contains no values` });
    }
  }

  const unique = [...new Set(recommendations)];
  return {
    rowCount,
    columnCount: headers.length,
    duplicateRows,
    malformedRows,
    columns: profiles,
    issues,
    recommendations: unique,
    generatedAt: new Date().toISOString(),
  };
}

/** Infers column types for a parsed table. Used for both stored metadata and analysis planning. */
function profileTable(table) {
  return table.headers.map((name) => inferColumn(name, table.df.column(name).values));
}

module.exports = { buildQualityReport, profileTable, normaliseLabel, iqrOutliers };
