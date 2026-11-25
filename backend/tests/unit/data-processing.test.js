const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../../src/analytics/parse");
const { profileTable, inferColumn, parseDate, toNumber } = require("../../src/analytics/profile");
const { analyseQuality } = require("../../src/analytics/quality");
const { applyOperations, operationsSchema } = require("../../src/analytics/cleaning");

const table = parseCsv(fs.readFileSync(path.join(__dirname, "..", "fixtures", "maternal.csv")));
const profile = profileTable(table);
const col = (name) => profile.find((c) => c.columnName === name);

describe("profiling", () => {
  test("infers types", () => {
    expect(col("age").inferredType).toBe("numeric");
    expect(col("complication").inferredType).toBe("boolean");
    expect(col("ward").inferredType).toBe("categorical");
    expect(col("admission_date").inferredType).toBe("date");
    expect(col("birth_weight_kg").inferredType).toBe("numeric");
    expect(col("birth_weight_kg").metadata.invalidCount).toBe(1);
  });

  test("flags identifier columns as sensitive and stores no labels for them", () => {
    expect(col("patient_name").isSensitive).toBe(true);
    expect(col("patient_name").metadata.levels).toBeUndefined();
    expect(inferColumn("contact", ["a@b.com", "c@d.org", "e@f.net"]).isSensitive).toBe(true);
    expect(inferColumn("phone", ["+2348031234567"]).isSensitive).toBe(true);
  });

  test("counts missing values using common missing markers", () => {
    expect(col("antenatal_visits").missingCount).toBe(1);
    expect(inferColumn("x", ["1", "NA", "n/a", "", "null", "2"]).missingCount).toBe(4);
  });

  test("number and date parsing", () => {
    expect(toNumber("1,234.5")).toBe(1234.5);
    expect(toNumber("12abc")).toBeNaN();
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("13/02/2026").date.toISOString().slice(0, 10)).toBe("2026-02-13");
    expect(parseDate("02/03/2026", false).date.toISOString().slice(0, 10)).toBe("2026-02-03");
  });
});

describe("quality report", () => {
  const q = analyseQuality(table, profile);
  const types = q.issues.map((i) => i.type);

  test("detects duplicates, missing, invalid numbers, label variants, dates and identifiers", () => {
    expect(q.duplicateRows).toBe(1);
    expect(types).toEqual(expect.arrayContaining(["duplicate_rows", "missing_values", "invalid_numeric", "inconsistent_labels", "inconsistent_dates", "possible_identifier"]));
  });

  test("recommends concrete operations that pass validation", () => {
    const ops = q.recommendations.map((r) => r.operation);
    expect(ops).toEqual(expect.arrayContaining([{ op: "drop_duplicates" }, { op: "coerce_numeric", column: "birth_weight_kg" }]));
    expect(operationsSchema.safeParse(ops).success).toBe(true);
  });

  test("never echoes values from identifier columns", () => {
    expect(JSON.stringify(q)).not.toContain("Ada A");
  });
});

describe("cleaning", () => {
  test("applies operations in order and logs each one without touching the input", () => {
    const before = JSON.stringify(table);
    const { table: out, log } = applyOperations(table, [
      { op: "drop_duplicates" },
      { op: "standardize_labels", column: "hypertension" },
      { op: "coerce_numeric", column: "birth_weight_kg" },
      { op: "fill_missing", column: "antenatal_visits", strategy: "median" },
      { op: "parse_dates", column: "admission_date", dayFirst: true },
      { op: "drop_columns", columns: ["patient_name"] },
    ]);
    expect(JSON.stringify(table)).toBe(before);
    expect(out.rows).toHaveLength(15);
    expect(out.columns).not.toContain("patient_name");
    expect(log.map((l) => l.op)).toEqual(["drop_duplicates", "standardize_labels", "coerce_numeric", "fill_missing", "parse_dates", "drop_columns"]);
    expect(log[0].result.rowsRemoved).toBe(1);
    expect(log[2].result.invalidSetToMissing).toBe(1);
    const hyp = out.columns.indexOf("hypertension");
    expect(new Set(out.rows.map((r) => r[hyp]))).toEqual(new Set(["Yes", "No"]));
    const d = out.columns.indexOf("admission_date");
    expect(out.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[d]))).toBe(true);
  });

  test("rejects unknown columns and operations that empty the table", () => {
    expect(() => applyOperations(table, [{ op: "coerce_numeric", column: "nope" }])).toThrow(/does not exist/);
    expect(() => applyOperations(table, [{ op: "drop_columns", columns: table.columns }])).toThrow(/every column/);
  });

  test("constant fill requires a value", () => {
    expect(operationsSchema.safeParse([{ op: "fill_missing", column: "age", strategy: "constant" }]).success).toBe(false);
  });
});
