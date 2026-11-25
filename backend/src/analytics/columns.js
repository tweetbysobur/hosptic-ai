// Column profiling: missing values, type inference and sensitivity flags.
const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "null", "none", "nil", "-", "?"]);
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2})?)?$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DASH_DATE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const BOOLEAN_TOKENS = new Set(["yes", "no", "true", "false", "y", "n"]);

// Names that suggest direct identifiers or personal data. These columns are masked in
// previews, excluded from AI processing, and cannot be used as analysis variables.
const SENSITIVE_NAME_PATTERN = new RegExp(
  "(^|[^a-z])(" +
    [
      "name", "surname", "first[_ ]?name", "last[_ ]?name", "full[_ ]?name",
      "patient[_ ]?(id|name|no|number)", "mrn", "nin", "nhis([_ ]?(no|number|id))?", "ssn", "national[_ ]?id",
      "phone", "mobile", "tel", "telephone", "e-?mail", "address", "addr",
      "dob", "date[_ ]?of[_ ]?birth", "birth[_ ]?date", "postcode", "zip",
      "hospital[_ ]?(no|number|id)", "file[_ ]?(no|number)", "folder[_ ]?(no|number)",
    ].join("|") +
    ")([^a-z]|$)",
  "i"
);

const isMissing = (value) => value === null || value === undefined || MISSING_TOKENS.has(String(value).trim().toLowerCase());

function toNumber(value) {
  if (typeof value !== "string") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Returns the date format label for a value, or null if the value is not a recognised date. */
function dateFormat(value) {
  const text = String(value).trim();
  if (ISO_DATE.test(text)) {
    const [, y, m, d] = ISO_DATE.exec(text);
    return isValidDate(Number(y), Number(m), Number(d)) ? "ISO" : "INVALID";
  }
  let match = SLASH_DATE.exec(text);
  if (match) return isValidDate(Number(match[3]), Number(match[2]), Number(match[1])) || isValidDate(Number(match[3]), Number(match[1]), Number(match[2])) ? "SLASH" : "INVALID";
  match = DASH_DATE.exec(text);
  if (match) return isValidDate(Number(match[3]), Number(match[2]), Number(match[1])) || isValidDate(Number(match[3]), Number(match[1]), Number(match[2])) ? "DASH" : "INVALID";
  return null;
}

function isValidDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isSensitiveName(name) {
  return SENSITIVE_NAME_PATTERN.test(name);
}

/**
 * Infers the type of one column from its raw string values.
 * Thresholds: 90% of present values must match a type for it to be assigned.
 */
function inferColumn(name, values) {
  const present = values.filter((v) => !isMissing(v)).map((v) => String(v).trim());
  const missingCount = values.length - present.length;
  const uniqueCount = new Set(present).size;
  const base = { columnName: name, missingCount, uniqueCount, isSensitive: isSensitiveName(name) };

  if (present.length === 0) return { ...base, inferredType: "EMPTY" };

  const numericCount = present.filter((v) => toNumber(v) !== null).length;
  if (numericCount / present.length >= 0.9) return { ...base, inferredType: "NUMERIC" };

  if (uniqueCount <= 2 && present.every((v) => BOOLEAN_TOKENS.has(v.toLowerCase()))) {
    return { ...base, inferredType: "BOOLEAN" };
  }

  const dateCount = present.filter((v) => dateFormat(v) !== null).length;
  if (dateCount / present.length >= 0.9) return { ...base, inferredType: "DATE" };

  if (uniqueCount <= Math.max(20, Math.floor(present.length * 0.2))) {
    return { ...base, inferredType: "CATEGORICAL" };
  }
  return { ...base, inferredType: "TEXT" };
}

module.exports = {
  isMissing,
  toNumber,
  dateFormat,
  isSensitiveName,
  inferColumn,
  MISSING_TOKENS,
};
