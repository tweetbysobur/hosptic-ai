// Column profiling: type inference, missing values, cardinality, identifier
// detection and per-column summaries. Pure functions over { columns, rows }.
const ss = require("simple-statistics");

const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "nil", "-", "--", "?", "missing", "not recorded", "unknown"]);
const TRUE_WORDS = new Set(["yes", "y", "true", "t"]);
const FALSE_WORDS = new Set(["no", "n", "false", "f"]);

const isMissing = (v) => v == null || MISSING.has(String(v).trim().toLowerCase());

// Accepts 12, -3.5, 1e3, 1,234 and 1,234.5. Returns NaN otherwise.
function toNumber(v) {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}

const DATE_FORMATS = [
  { name: "YYYY-MM-DD", re: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/, order: "YMD" },
  { name: "YYYY/MM/DD", re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: "YMD" },
  { name: "DD/MM/YYYY or MM/DD/YYYY", re: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, order: "AMBIG" },
];

function validYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Returns { format, date } or null. Ambiguous a/b/yyyy is resolved by dayFirst.
function parseDate(v, dayFirst = true) {
  const s = String(v).trim();
  for (const f of DATE_FORMATS) {
    const m = s.match(f.re);
    if (!m) continue;
    let y, mo, d;
    if (f.order === "YMD") [y, mo, d] = [+m[1], +m[2], +m[3]];
    else {
      const a = +m[1];
      const b = +m[2];
      y = +m[3];
      if (a > 12) [d, mo] = [a, b];
      else if (b > 12) [mo, d] = [a, b];
      else [d, mo] = dayFirst ? [a, b] : [b, a];
    }
    if (!validYmd(y, mo, d)) return null;
    return { format: f.name, date: new Date(Date.UTC(y, mo - 1, d)) };
  }
  return null;
}

const SENSITIVE_NAME =
  /(^|[^a-z])(first.?name|last.?name|sur.?name|full.?name|patient.?name|name|phone|mobile|tel(ephone)?|e.?mail|address|street|nin|bvn|ssn|nhs.?(no|number)?|mrn|medical.?record|hospital.?(no|number)|patient.?(id|no|number)|passport|dob|date.?of.?birth|birth.?date|next.?of.?kin)([^a-z]|$)/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[\d\s()-]{10,16}$/;

function classifyValues(values) {
  let numeric = 0;
  let date = 0;
  let bool = 0;
  let email = 0;
  let phone = 0;
  const formats = new Set();
  for (const v of values) {
    const s = String(v).trim();
    const lower = s.toLowerCase();
    if (Number.isFinite(toNumber(s))) numeric++;
    const pd = parseDate(s);
    if (pd) {
      date++;
      formats.add(pd.format);
    }
    if (TRUE_WORDS.has(lower) || FALSE_WORDS.has(lower)) bool++;
    if (EMAIL_RE.test(s)) email++;
    if (PHONE_RE.test(s) && s.replace(/\D/g, "").length >= 10) phone++;
  }
  return { numeric, date, bool, email, phone, formats };
}

// Infers one of: numeric, boolean, date, categorical, text, identifier, empty.
function inferColumn(name, rawValues) {
  const present = rawValues.filter((v) => !isMissing(v)).map((v) => String(v).trim());
  const missingCount = rawValues.length - present.length;
  const unique = new Set(present);
  const n = present.length;
  const base = { name, missingCount, uniqueCount: unique.size, nonMissing: n };
  if (n === 0) return { ...base, type: "empty", isSensitive: SENSITIVE_NAME.test(name), invalidCount: 0 };

  const c = classifyValues(present);
  const share = (k) => k / n;
  let type;
  let invalidCount = 0;

  const distinctNumbers = new Set(present.filter((v) => Number.isFinite(toNumber(v)))).size;
  // Mostly numbers: treat as numeric and report the rest as invalid entries.
  if (share(c.numeric) >= 0.95 || (share(c.numeric) >= 0.8 && distinctNumbers > 5)) {
    type = "numeric";
    invalidCount = n - c.numeric;
    // Two-value 0/1 columns are flags, analysed as categories.
    const nums = new Set(present.filter((v) => Number.isFinite(toNumber(v))).map(toNumber));
    if (nums.size <= 2 && [...nums].every((x) => x === 0 || x === 1)) type = "boolean";
  } else if (share(c.date) >= 0.9) {
    type = "date";
    invalidCount = n - c.date;
  } else if (share(c.bool) >= 0.95 && unique.size <= 4) {
    type = "boolean";
    invalidCount = n - c.bool;
  } else {
    const ratio = unique.size / n;
    if (unique.size <= Math.max(20, Math.min(50, Math.ceil(n * 0.05)))) type = "categorical";
    else if (ratio > 0.9) type = "identifier";
    else type = "text";
  }

  const looksPersonal = share(c.email) > 0.5 || share(c.phone) > 0.5;
  const isSensitive = SENSITIVE_NAME.test(name) || looksPersonal || type === "identifier";
  return { ...base, type, invalidCount, isSensitive, dateFormats: [...c.formats] };
}

function numericValues(rows, index) {
  const out = [];
  for (const r of rows) {
    if (isMissing(r[index])) continue;
    const x = toNumber(r[index]);
    if (Number.isFinite(x)) out.push(x);
  }
  return out;
}

const round = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

function numericSummary(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = ss.quantileSorted(sorted, 0.25);
  const q3 = ss.quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return {
    count: values.length,
    mean: round(ss.mean(values)),
    median: round(ss.medianSorted(sorted)),
    sd: values.length > 1 ? round(ss.sampleStandardDeviation(values)) : null,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1: round(q1),
    q3: round(q3),
    outlierCount: values.filter((x) => x < lo || x > hi).length,
    outlierFences: { lower: round(lo), upper: round(hi) },
  };
}

function topLevels(values, limit = 20) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

// Full profile used for DatasetColumn rows.
function profileTable({ columns, rows }) {
  return columns.map((name, i) => {
    const raw = rows.map((r) => r[i]);
    const col = inferColumn(name, raw);
    const meta = { invalidCount: col.invalidCount };
    if (col.type === "numeric") meta.summary = numericSummary(numericValues(rows, i));
    // Category labels are stored for non-sensitive columns only.
    if (["categorical", "boolean"].includes(col.type) && !col.isSensitive) {
      meta.levels = topLevels(raw.filter((v) => !isMissing(v)).map((v) => String(v).trim()));
    }
    if (col.type === "date") meta.dateFormats = col.dateFormats;
    return {
      position: i,
      columnName: name,
      inferredType: col.type,
      missingCount: col.missingCount,
      uniqueCount: col.uniqueCount,
      isSensitive: col.isSensitive,
      metadata: meta,
    };
  });
}

module.exports = {
  isMissing,
  toNumber,
  parseDate,
  inferColumn,
  numericValues,
  numericSummary,
  topLevels,
  profileTable,
  round,
  TRUE_WORDS,
  FALSE_WORDS,
};
