const jStat = require("jstat");
const { summarise, frequencyTable, histogram } = require("../../src/analytics/descriptive");
const { independentTTest, pairedTTest, chiSquareTest, oneWayAnova } = require("../../src/analytics/inferential");
const { pearsonCorrelation, spearmanCorrelation, linearRegression, ranks } = require("../../src/analytics/correlation");
const { runAnalysis } = require("../../src/analytics/engine");
const { AnalysisError } = require("../../src/analytics/errors");

describe("descriptive statistics", () => {
  test("summary of 1..5 matches hand-calculated values", () => {
    const s = summarise([1, 2, 3, 4, 5]);
    expect(s.sampleSize).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.median).toBe(3);
    expect(s.variance).toBeCloseTo(2.5, 6);
    expect(s.standardDeviation).toBeCloseTo(Math.sqrt(2.5), 6);
    expect(s.q1).toBe(2);
    expect(s.q3).toBe(4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
  });

  test("frequency table is sorted by count then label", () => {
    const f = frequencyTable(["a", "b", "b", "c", "c", "c"]);
    expect(f.map((r) => r.label)).toEqual(["c", "b", "a"]);
    expect(f[0].percent).toBe(50);
  });

  test("histogram counts every value once", () => {
    const bins = histogram([1, 2, 2, 3, 9, 10]);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(6);
  });
});

describe("distribution functions used by the engine", () => {
  test("two-sided critical t for df=10 at 95% is 2.228", () => {
    expect(jStat.studentt.inv(0.975, 10)).toBeCloseTo(2.2281, 3);
  });
  test("chi-square 0.95 quantile with 1 df is 3.841", () => {
    expect(jStat.chisquare.cdf(3.841459, 1)).toBeCloseTo(0.95, 3);
  });
});

describe("independent t-test (Welch)", () => {
  const a = [1, 2, 3, 4, 5];
  const b = [3, 4, 5, 6, 7];
  const out = independentTTest(a, b, ["A", "B"]);

  test("statistic, df and mean difference", () => {
    expect(out.results.meanDifference).toBe(-2);
    expect(out.results.testStatistic.value).toBeCloseTo(-2, 6);
    expect(out.results.degreesOfFreedom).toBeCloseTo(8, 4);
  });

  test("p-value for t=2 with df=8 is about 0.0805", () => {
    expect(out.results.pValue).toBeGreaterThan(0.079);
    expect(out.results.pValue).toBeLessThan(0.082);
  });

  test("confidence interval contains the mean difference", () => {
    const ci = out.results.confidenceInterval;
    expect(ci.lower).toBeLessThan(-2);
    expect(ci.upper).toBeGreaterThan(-2);
  });

  test("groups smaller than 2 are rejected", () => {
    expect(() => independentTTest([1], [2, 3], ["A", "B"])).toThrow(AnalysisError);
  });
});

describe("paired t-test", () => {
  test("constant differences are rejected as undefined", () => {
    expect(() => pairedTTest([2, 3, 4], [1, 2, 3])).toThrow(/undefined/);
  });
  test("returns df = n - 1", () => {
    const out = pairedTTest([5, 7, 6, 9], [4, 5, 5, 6]);
    expect(out.results.degreesOfFreedom).toBe(3);
    expect(out.results.pValue).toBeGreaterThan(0);
  });
});

describe("chi-square test of independence", () => {
  test("2x2 table [[10,20],[30,40]] gives chi2 0.7937, df 1, p about 0.373", () => {
    const pairs = [];
    const add = (r, c, n) => {
      for (let i = 0; i < n; i += 1) pairs.push([r, c]);
    };
    add("x", "p", 10);
    add("x", "q", 20);
    add("y", "p", 30);
    add("y", "q", 40);
    const out = chiSquareTest(pairs);
    expect(out.results.testStatistic.value).toBeCloseTo(0.7937, 3);
    expect(out.results.degreesOfFreedom).toBe(1);
    expect(out.results.pValue).toBeCloseTo(0.373, 2);
  });
});

describe("one-way ANOVA", () => {
  test("identical group means give F about 0", () => {
    const out = oneWayAnova([
      { label: "a", values: [1, 2, 3] },
      { label: "b", values: [1, 2, 3] },
      { label: "c", values: [1, 2, 3] },
    ]);
    expect(out.results.testStatistic.value).toBe(0);
    expect(out.results.degreesOfFreedom).toEqual({ between: 2, within: 6 });
  });

  test("separated groups give a small p-value", () => {
    const out = oneWayAnova([
      { label: "a", values: [1, 1.1, 0.9, 1.05] },
      { label: "b", values: [5, 5.1, 4.9, 5.05] },
      { label: "c", values: [9, 9.1, 8.9, 9.05] },
    ]);
    expect(out.results.pValue).toBeLessThan(0.001);
  });
});

describe("correlation and regression", () => {
  test("ranks average tied values", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  test("perfect positive correlation has r = 1 and p = 0", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = pearsonCorrelation(x, x.map((v) => 2 * v));
    expect(out.results.effectSize.value).toBe(1);
    expect(out.results.pValue).toBe(0);
  });

  test("known Pearson r for a small sample is 0.7746", () => {
    const out = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(out.results.effectSize.value).toBeCloseTo(0.7746, 3);
    expect(out.results.degreesOfFreedom).toBe(3);
  });

  test("Spearman rho is 1 for any strictly monotonic relationship", () => {
    const out = spearmanCorrelation([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]);
    expect(out.results.effectSize.value).toBe(1);
  });

  test("regression recovers slope 2 and intercept 1 exactly", () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((v) => 2 * v + 1);
    const out = linearRegression(x, y);
    expect(out.results.coefficients.slope.estimate).toBeCloseTo(2, 6);
    expect(out.results.coefficients.intercept.estimate).toBeCloseTo(1, 6);
    expect(out.results.rSquared).toBeCloseTo(1, 6);
  });

  test("constant predictor is rejected", () => {
    expect(() => pearsonCorrelation([2, 2, 2, 2], [1, 2, 3, 4])).toThrow(/constant/);
  });
});

describe("runAnalysis", () => {
  const table = (headers, rows) => {
    const { ColumnTable: DataFrame } = require("../../src/utils/column-table");
    const df = new DataFrame(rows, { columns: headers });
    return { headers, df, rowCount: rows.length, columnCount: headers.length, malformedRows: 0 };
  };

  test("tiny p-values get a safe display string", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [String(i), String(2 * i + (i % 3))]);
    const t = table(["x", "y"], rows);
    const out = runAnalysis({ analysisType: "PEARSON_CORRELATION", variables: { outcome: "y", predictor: "x" } }, t, []);
    expect(out.results.pValueDisplay).toBe("<0.0001");
  });

  test("excludes incomplete pairs and reports the count", () => {
    const t = table(["x", "y"], [["1", "2"], ["2", ""], ["3", "6"], ["4", "8"], ["5", "10"]]);
    const out = runAnalysis(
      { analysisType: "LINEAR_REGRESSION", variables: { outcome: "y", predictor: "x" } },
      t,
      [{ columnName: "x", inferredType: "NUMERIC" }, { columnName: "y", inferredType: "NUMERIC" }]
    );
    expect(out.methodology.excludedRows).toBe(1);
    expect(out.results.coefficients.slope.estimate).toBeCloseTo(2, 6);
    expect(out.limitations.length).toBeGreaterThan(0);
  });

  test("scatter points put the predictor on x and the outcome on y", () => {
    const t = table(["x", "y"], [["1", "12"], ["2", "14"], ["3", "16"], ["4", "18"]]);
    const cols = [{ columnName: "x", inferredType: "NUMERIC" }, { columnName: "y", inferredType: "NUMERIC" }];
    for (const analysisType of ["PEARSON_CORRELATION", "SPEARMAN_CORRELATION", "LINEAR_REGRESSION"]) {
      const v = runAnalysis({ analysisType, variables: { outcome: "y", predictor: "x" } }, t, cols).visualizationData;
      expect(v.x).toBe("x");
      expect(v.y).toBe("y");
      expect(v.points[0]).toEqual({ x: 1, y: 12 });
      if (v.fitLine) expect(v.fitLine.slope * 1 + v.fitLine.intercept).toBeCloseTo(12, 6);
    }
  });
});
