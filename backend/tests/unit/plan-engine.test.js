const fs = require("fs");
const path = require("path");
const { parseCsv } = require("../../src/analytics/parse");
const { profileTable } = require("../../src/analytics/profile");
const { validatePlan } = require("../../src/analytics/plan");
const { runAnalysis } = require("../../src/analytics/engine");
const { interpret } = require("../../src/analytics/interpret");
const { keywordPlan } = require("../../src/analytics/keyword-planner");

const table = parseCsv(fs.readFileSync(path.join(__dirname, "..", "fixtures", "maternal.csv")));
const profile = profileTable(table);
const run = (plan) => {
  const v = validatePlan(plan, profile);
  return runAnalysis(table, v.plan, { notes: v.notes });
};

describe("plan validation", () => {
  test("rejects unknown and identifier columns", () => {
    expect(() => validatePlan({ analysisType: "descriptive", variables: { columns: ["nope"] } }, profile)).toThrow(/does not exist/);
    expect(() => validatePlan({ analysisType: "descriptive", variables: { columns: ["patient_name"] } }, profile)).toThrow(/identifier/);
  });

  test("rejects incompatible column types", () => {
    expect(() => validatePlan({ analysisType: "pearson_correlation", variables: { columns: ["age", "ward"] } }, profile)).toThrow(/must be numeric/);
    expect(() => validatePlan({ analysisType: "chi_square", variables: { columns: ["age", "ward"] } }, profile)).toThrow(/categorical/);
  });

  test("switches t-test to ANOVA for 3+ groups and records why", () => {
    const v = validatePlan({ analysisType: "independent_t_test", variables: { outcome: "age", group: "ward" } }, profile);
    expect(v.plan.analysisType).toBe("one_way_anova");
    expect(v.notes[0]).toMatch(/3 groups/);
  });

  test("rejects unexpected fields", () => {
    expect(() => validatePlan({ analysisType: "descriptive", variables: { columns: ["age"] }, sql: "DROP TABLE" }, profile)).toThrow(/invalid/);
  });
});

describe("analysis engine", () => {
  test("t-test returns only t-test metrics with verified ranges", () => {
    const r = run({ analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" } });
    expect(r.methodology.test).toMatch(/Welch/);
    expect(r.results).toEqual(expect.objectContaining({ sampleSize: 16, degreesOfFreedom: expect.any(Number), pValue: expect.any(Number), confidenceInterval95: expect.any(Array) }));
    expect(r.results.effectSize).toHaveProperty("hedgesG");
    expect(r.results).not.toHaveProperty("cramersV");
    expect(r.results.pValue).toBeGreaterThanOrEqual(0);
    expect(r.results.pValue).toBeLessThanOrEqual(1);
    expect(r.assumptions.map((a) => a.name)).toEqual(expect.arrayContaining(["Independent observations", "Equal variances"]));
  });

  test("chi-square on a 2x2 table reports Fisher and the odds ratio and flags small expected counts", () => {
    const r = run({ analysisType: "chi_square", variables: { columns: ["hypertension", "complication"] } });
    expect(r.results.fisherExactP).toBeDefined();
    expect(r.results.oddsRatio).toBeDefined();
    expect(r.assumptions.find((a) => a.name === "Expected cell counts").status).toBe("violated");
    expect(r.methodology.preferredResult).toBe("fisherExactP");
    // "no" and "No" are merged into one category.
    expect(r.results.contingencyTable.rows).toEqual(["No", "Yes"]);
  });

  test("regression, correlation, ANOVA, paired, distribution and descriptive all run", () => {
    for (const plan of [
      { analysisType: "linear_regression", variables: { predictor: "age", outcome: "antenatal_visits" } },
      { analysisType: "pearson_correlation", variables: { columns: ["age", "parity"] } },
      { analysisType: "spearman_correlation", variables: { columns: ["age", "parity"] } },
      { analysisType: "one_way_anova", variables: { outcome: "age", group: "ward" } },
      { analysisType: "paired_t_test", variables: { columns: ["parity", "antenatal_visits"] } },
      { analysisType: "distribution", variables: { outcome: "age" } },
      { analysisType: "descriptive", variables: { columns: ["age", "ward"] } },
      { analysisType: "frequency", variables: { columns: ["delivery_mode"] } },
    ]) {
      const r = run(plan);
      expect(r.methodology.analysisType).toBe(plan.analysisType);
      expect(r.visualizationData.charts.length).toBeGreaterThan(0);
      expect(typeof interpret(r)).toBe("string");
      expect(interpret(r).length).toBeGreaterThan(20);
    }
  });

  test("listwise deletion is reported", () => {
    const r = run({ analysisType: "linear_regression", variables: { predictor: "age", outcome: "antenatal_visits" } });
    expect(r.results.sampleSize).toBe(15);
    expect(r.methodology.missingData).toMatch(/1 of 16 rows were excluded/);
  });

  test("interpretation never calls a non-significant result significant", () => {
    const r = run({ analysisType: "one_way_anova", variables: { outcome: "age", group: "ward" } });
    expect(r.results.significantAtAlpha).toBe(false);
    expect(interpret(r)).toMatch(/not statistically significant/);
  });
});

describe("keyword planner", () => {
  test("maps the brief's example question", () => {
    const { plan } = keywordPlan("Analyse the relationship between age and complication", profile);
    expect(plan).toEqual({ analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" } });
  });

  test("never picks identifier columns and explains misses", () => {
    expect(keywordPlan("patient name by ward", profile).plan.variables).toEqual({ columns: ["ward"] });
    expect(keywordPlan("how are things going", profile).plan).toBeNull();
  });

  test("predict X from Y sets roles", () => {
    expect(keywordPlan("predict birth weight kg from age", profile).plan.variables).toEqual({ predictor: "age", outcome: "birth_weight_kg" });
  });
});
