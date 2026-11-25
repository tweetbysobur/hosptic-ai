// Explicit, recorded cleaning operations. Each returns a new table and a
// summary of exactly what changed. The original upload is never modified.
const ss = require("simple-statistics");
const { z } = require("zod");
const { isMissing, toNumber, parseDate, numericValues } = require("./profile");
const { labelKey } = require("./quality");
const { unprocessable } = require("../utils/errors");

const col = z.string().min(1).max(120);

const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("drop_duplicates") }).strict(),
  z.object({ op: z.literal("drop_missing"), columns: z.array(col).min(1).max(50).optional() }).strict(),
  z
    .object({
      op: z.literal("fill_missing"),
      column: col,
      strategy: z.enum(["mean", "median", "mode", "constant"]),
      value: z.union([z.string().max(200), z.number()]).optional(),
    })
    .strict(),
  z.object({ op: z.literal("trim_whitespace"), columns: z.array(col).max(50).optional() }).strict(),
  z
    .object({ op: z.literal("standardize_labels"), column: col, mapping: z.record(z.string().max(200), z.string().max(200)).optional() })
    .strict(),
  z.object({ op: z.literal("coerce_numeric"), column: col }).strict(),
  z.object({ op: z.literal("remove_outliers"), column: col, method: z.literal("iqr").default("iqr"), k: z.number().min(1).max(5).default(1.5) }).strict(),
  z.object({ op: z.literal("drop_columns"), columns: z.array(col).min(1).max(50) }).strict(),
  z.object({ op: z.literal("parse_dates"), column: col, dayFirst: z.boolean().default(true) }).strict(),
]).superRefine((o, ctx) => {
  if (o.op === "fill_missing" && o.strategy === "constant" && o.value === undefined) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "value is required for the constant strategy" });
  }
});

const operationsSchema = z.array(operationSchema).min(1).max(20);

function indexOf(table, name) {
  const i = table.columns.indexOf(name);
  if (i < 0) throw unprocessable(`Column "${name}" does not exist`);
  return i;
}

const clone = (t) => ({ columns: [...t.columns], rows: t.rows.map((r) => [...r]) });

const ops = {
  drop_duplicates(t) {
    const seen = new Set();
    const rows = t.rows.filter((r) => {
      const k = JSON.stringify(r.map((v) => (isMissing(v) ? "" : String(v).trim())));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { table: { ...t, rows }, summary: { rowsRemoved: t.rows.length - rows.length } };
  },

  drop_missing(t, o) {
    const idx = (o.columns || t.columns).map((c) => indexOf(t, c));
    const rows = t.rows.filter((r) => idx.every((i) => !isMissing(r[i])));
    return { table: { ...t, rows }, summary: { rowsRemoved: t.rows.length - rows.length } };
  },

  fill_missing(t, o) {
    const i = indexOf(t, o.column);
    let fill;
    if (o.strategy === "constant") fill = String(o.value);
    else if (o.strategy === "mode") {
      const present = t.rows.map((r) => r[i]).filter((v) => !isMissing(v)).map((v) => String(v).trim());
      if (!present.length) throw unprocessable(`"${o.column}" has no values to compute a mode from`);
      fill = ss.modeFast(present);
    } else {
      const nums = numericValues(t.rows, i);
      if (!nums.length) throw unprocessable(`"${o.column}" has no numeric values for ${o.strategy}`);
      fill = String(Number((o.strategy === "mean" ? ss.mean(nums) : ss.median(nums)).toFixed(6)));
    }
    let cells = 0;
    const rows = t.rows.map((r) => {
      if (!isMissing(r[i])) return r;
      cells++;
      const n = [...r];
      n[i] = fill;
      return n;
    });
    return { table: { ...t, rows }, summary: { cellsFilled: cells, fillValue: fill } };
  },

  trim_whitespace(t, o) {
    const idx = (o.columns || t.columns).map((c) => indexOf(t, c));
    let cells = 0;
    const rows = t.rows.map((r) => {
      const n = [...r];
      for (const i of idx) {
        const v = n[i] == null ? "" : String(n[i]);
        const next = v.trim().replace(/\s+/g, " ");
        if (next !== v) {
          cells++;
          n[i] = next;
        }
      }
      return n;
    });
    return { table: { ...t, rows }, summary: { cellsChanged: cells } };
  },

  standardize_labels(t, o) {
    const i = indexOf(t, o.column);
    let mapping = o.mapping;
    if (!mapping) {
      // Default: each case/spacing group maps to its most frequent spelling.
      const groups = new Map();
      for (const r of t.rows) {
        if (isMissing(r[i])) continue;
        const raw = String(r[i]);
        const k = labelKey(raw);
        if (!groups.has(k)) groups.set(k, new Map());
        groups.get(k).set(raw, (groups.get(k).get(raw) || 0) + 1);
      }
      mapping = {};
      for (const g of groups.values()) {
        const best = [...g.entries()].sort((a, b) => b[1] - a[1])[0][0].trim();
        for (const raw of g.keys()) if (raw !== best) mapping[raw] = best;
      }
    }
    let cells = 0;
    const rows = t.rows.map((r) => {
      const v = r[i] == null ? "" : String(r[i]);
      if (!(v in mapping)) return r;
      cells++;
      const n = [...r];
      n[i] = mapping[v];
      return n;
    });
    return { table: { ...t, rows }, summary: { cellsChanged: cells, mappingsApplied: Object.keys(mapping).length } };
  },

  coerce_numeric(t, o) {
    const i = indexOf(t, o.column);
    let toMissing = 0;
    let normalised = 0;
    const rows = t.rows.map((r) => {
      if (isMissing(r[i])) return r;
      const x = toNumber(r[i]);
      const n = [...r];
      if (Number.isFinite(x)) {
        if (String(x) !== String(r[i]).trim()) normalised++;
        n[i] = String(x);
      } else {
        toMissing++;
        n[i] = "";
      }
      return n;
    });
    return { table: { ...t, rows }, summary: { invalidSetToMissing: toMissing, valuesNormalised: normalised } };
  },

  remove_outliers(t, o) {
    const i = indexOf(t, o.column);
    const nums = numericValues(t.rows, i).sort((a, b) => a - b);
    if (nums.length < 4) throw unprocessable(`"${o.column}" needs at least 4 numeric values for outlier removal`);
    const q1 = ss.quantileSorted(nums, 0.25);
    const q3 = ss.quantileSorted(nums, 0.75);
    const lo = q1 - o.k * (q3 - q1);
    const hi = q3 + o.k * (q3 - q1);
    const rows = t.rows.filter((r) => {
      const x = toNumber(r[i]);
      return !Number.isFinite(x) || (x >= lo && x <= hi);
    });
    return { table: { ...t, rows }, summary: { rowsRemoved: t.rows.length - rows.length, lowerFence: lo, upperFence: hi } };
  },

  drop_columns(t, o) {
    const idx = new Set(o.columns.map((c) => indexOf(t, c)));
    return {
      table: { columns: t.columns.filter((_, i) => !idx.has(i)), rows: t.rows.map((r) => r.filter((_, i) => !idx.has(i))) },
      summary: { columnsRemoved: o.columns },
    };
  },

  parse_dates(t, o) {
    const i = indexOf(t, o.column);
    let converted = 0;
    let unreadable = 0;
    const rows = t.rows.map((r) => {
      if (isMissing(r[i])) return r;
      const pd = parseDate(r[i], o.dayFirst);
      const n = [...r];
      if (pd) {
        n[i] = pd.date.toISOString().slice(0, 10);
        converted++;
      } else {
        n[i] = "";
        unreadable++;
      }
      return n;
    });
    return { table: { ...t, rows }, summary: { converted, unreadableSetToMissing: unreadable } };
  },
};

function applyOperations(table, operations) {
  let current = clone(table);
  const log = [];
  for (const o of operations) {
    const before = current.rows.length;
    const { table: next, summary } = ops[o.op](current, o);
    log.push({ ...o, result: summary, rowsBefore: before, rowsAfter: next.rows.length });
    current = next;
  }
  if (current.rows.length === 0) throw unprocessable("These operations would remove every row");
  if (current.columns.length === 0) throw unprocessable("These operations would remove every column");
  return { table: current, log };
}

module.exports = { applyOperations, operationsSchema, operationSchema };
