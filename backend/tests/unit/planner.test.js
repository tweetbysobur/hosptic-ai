const { resolvePlan } = require("../../src/analytics/planner");
const { intentSchema, interpretationSchema } = require("../../src/ai/schemas");
const { validateInterpretation } = require("../../src/ai/interpretation.service");
const { extractJsonObject } = require("../../src/ai/zai.client");
const { detectFileType } = require("../../src/services/file-parser");
const { isSensitiveName, inferColumn, dateFormat } = require("../../src/analytics/columns");

const columns = [
  { columnName: "Maternal Age", inferredType: "NUMERIC", isSensitive: false },
  { columnName: "Complication", inferredType: "CATEGORICAL", isSensitive: false },
  { columnName: "Patient Name", inferredType: "TEXT", isSensitive: true },
  { columnName: "Parity", inferredType: "NUMERIC", isSensitive: false },
];

describe("planner", () => {
  test("resolves names case-insensitively to canonical column names", () => {
    const plan = resolvePlan(
      { analysisType: "PEARSON_CORRELATION", variables: { outcome: "maternal age", predictor: "PARITY" } },
      columns
    );
    expect(plan.variables).toEqual({ outcome: "Maternal Age", predictor: "Parity" });
  });

  test("rejects a column that does not exist", () => {
    expect(() =>
      resolvePlan({ analysisType: "PEARSON_CORRELATION", variables: { outcome: "Weight", predictor: "Parity" } }, columns)
    ).toThrow(/does not match/);
  });

  test("rejects a sensitive column even if the name matches", () => {
    expect(() =>
      resolvePlan({ analysisType: "DESCRIPTIVE", variables: { outcome: "Patient Name" } }, columns)
    ).toThrow(/personal data/);
  });

  test("rejects a wrong column type for the role", () => {
    expect(() =>
      resolvePlan({ analysisType: "INDEPENDENT_T_TEST", variables: { outcome: "Complication", group: "Maternal Age" } }, columns)
    ).toThrow(/outcome/);
  });

  test("rejects variable roles that the method does not use", () => {
    expect(() =>
      resolvePlan(
        { analysisType: "DESCRIPTIVE", variables: { outcome: "Parity", predictor: "Maternal Age" } },
        columns
      )
    ).toThrow(/Unexpected variable roles/);
  });
});

describe("AI schemas are strict", () => {
  test("intent rejects unknown analysis types and extra keys", () => {
    expect(intentSchema.safeParse({ analysisType: "RUN_SQL", variables: {} }).success).toBe(false);
    expect(
      intentSchema.safeParse({ analysisType: "DESCRIPTIVE", variables: { outcome: "a" }, code: "drop table" }).success
    ).toBe(false);
    expect(intentSchema.safeParse({ analysisType: "DESCRIPTIVE", variables: { outcome: "a" } }).success).toBe(true);
  });
  test("interpretation requires a non-trivial string", () => {
    expect(interpretationSchema.safeParse({ interpretation: "ok" }).success).toBe(false);
  });
});

describe("interpretation validation", () => {
  const analysis = {
    results: { pValue: 0.2, testStatistic: { value: 1.5 }, sampleSize: { pairs: 40 } },
  };
  test("accepts numbers that appear in the results", () => {
    expect(validateInterpretation("The p-value is 0.2 across 40 pairs. This is not statistically significant.", analysis).ok).toBe(true);
  });
  test("rejects numbers that are not in the results", () => {
    expect(validateInterpretation("The effect was 87.3 units across 40 pairs.", analysis).ok).toBe(false);
  });
  test("rejects a significance claim that contradicts the p-value", () => {
    expect(validateInterpretation("The association is statistically significant.", analysis).ok).toBe(false);
  });
  test("rejects causal language", () => {
    expect(validateInterpretation("Older age causes complications.", analysis).ok).toBe(false);
  });
});

describe("AI JSON extraction", () => {
  test("handles fenced JSON", () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
  test("rejects text without JSON", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("file type detection", () => {
  test("accepts CSV text", () => {
    expect(detectFileType(Buffer.from("a,b\n1,2\n"), "data.csv")).toBe("CSV");
  });
  test("rejects a zip archive renamed to .csv", () => {
    expect(() => detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "data.csv")).toThrow(/binary archive/);
  });
  test("rejects unsupported extensions", () => {
    expect(() => detectFileType(Buffer.from("x"), "data.exe")).toThrow(/Unsupported/);
  });
  test("rejects a non-zip file named .xlsx", () => {
    expect(() => detectFileType(Buffer.from("a,b"), "data.xlsx")).toThrow(/not a valid Excel/);
  });
});

describe("column inference", () => {
  test("numeric column with a few blanks", () => {
    const c = inferColumn("Age", ["30", "", "41", "NA", "29"]);
    expect(c.inferredType).toBe("NUMERIC");
    expect(c.missingCount).toBe(2);
  });
  test("binary yes/no column is BOOLEAN", () => {
    expect(inferColumn("Smoker", ["yes", "no", "no", "yes"]).inferredType).toBe("BOOLEAN");
  });
  test("ISO and slash dates are recognised; invalid dates are flagged", () => {
    expect(dateFormat("2024-02-29")).toBe("ISO");
    expect(dateFormat("2023-02-29")).toBe("INVALID");
    expect(dateFormat("05/11/2024")).toBe("SLASH");
  });
  test("identifier-like names are flagged as sensitive", () => {
    expect(isSensitiveName("Patient_ID")).toBe(true);
    expect(isSensitiveName("Date of birth")).toBe(true);
    expect(isSensitiveName("Maternal age")).toBe(false);
    expect(isSensitiveName("Ward")).toBe(false);
    expect(isSensitiveName("Patient satisfaction")).toBe(false);
    expect(isSensitiveName("Phone number")).toBe(true);
  });
});
