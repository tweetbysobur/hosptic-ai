// Reference values computed with SciPy 1.18 (scipy.stats). The engine must
// match them; this is how we know the numbers are real.
const S = require("../../src/analytics/statistics");

const a = [23, 25, 28, 30, 31, 33, 35, 36, 38, 40, 22, 27];
const b = [30, 32, 35, 37, 38, 41, 42, 44, 29, 45];
const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18.3, 19.9, 22.4, 23.8];
const g3 = [[5, 6, 7, 8, 6], [8, 9, 10, 9, 11], [12, 11, 13, 14, 12]];

const close = (actual, expected, digits = 8) => expect(actual).toBeCloseTo(expected, digits);

describe("statistics engine matches SciPy", () => {
  test("Welch t-test (ttest_ind equal_var=False)", () => {
    const r = S.independentT(a, b);
    close(r.t, -2.6696491749843827);
    close(r.df, 19.45973663574668, 6);
    close(r.pValue, 0.014946291720637928, 7);
  });

  test("paired t-test (ttest_rel)", () => {
    const r = S.pairedT(a.slice(0, 10), b);
    close(r.t, -3.331894782648395);
    close(r.pValue, 0.008772585979052354, 9);
  });

  test("one-way ANOVA (f_oneway)", () => {
    const r = S.oneWayAnova(g3);
    close(r.F, 34.6153846153846);
    close(r.pValue, 1.0393554099460412e-5, 12);
  });

  test("Welch ANOVA", () => {
    const r = S.welchAnova(g3);
    close(r.F, 31.952662721893496);
    close(r.df2, 8.0);
    close(r.pValue, 0.00015322009349254378, 10);
  });

  test("chi-square without continuity correction and Fisher exact", () => {
    const r = S.chiSquare([[12, 5], [3, 10]]);
    close(r.chiSquare, 6.651583710407239);
    close(r.pValue, 0.00990677301136375, 10);
    close(r.fisherExactP, 0.02532768703367614, 10);
  });

  test("Pearson correlation keeps precision for tiny p-values", () => {
    const r = S.pearson(x, y);
    close(r.r, 0.9995933188416672, 10);
    expect(r.pValue).toBeGreaterThan(0);
    expect(r.pValue / 8.754400950473025e-17).toBeCloseTo(1, 6);
  });

  test("Spearman correlation", () => {
    const r = S.spearman(a, [...a].reverse());
    close(r.rho, 0.35664335664335667, 10);
    close(r.pValue, 0.2551377517589572, 8);
  });

  test("simple linear regression (linregress)", () => {
    const r = S.linearRegression(x, y);
    close(r.slope, 2.0041958041958043, 10);
    close(r.intercept, 0.02272727272727515, 10);
    close(r.slopeSe, 0.01808067618719584, 10);
    close(r.interceptSe, 0.133070173655685, 10);
    close(r.rSquared, 0.9991868030728994, 10);
  });

  test("Brown-Forsythe Levene (levene center=median)", () => {
    const r = S.levene(g3);
    close(r.F, 0);
    close(r.pValue, 1);
  });

  test("Mann-Whitney U asymptotic with continuity correction", () => {
    const r = S.mannWhitney(a, b);
    close(r.U, 25.5);
    close(r.pValue, 0.024845603124036063, 9);
  });

  test("descriptive statistics", () => {
    const d = S.describe([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.n).toBe(8);
    close(d.mean, 5);
    close(d.median, 4.5);
    expect(d.mode).toEqual([4]);
    close(d.variance, 32 / 7);
    expect(d.min).toBe(2);
    expect(d.max).toBe(9);
  });

  test("frequencies with Wilson intervals", () => {
    const f = S.frequencies(["a", "a", "b", "a"]);
    expect(f[0]).toMatchObject({ value: "a", count: 3 });
    close(f[0].proportion, 0.75);
    expect(f[0].ci95[0]).toBeGreaterThan(0.2);
    expect(f[0].ci95[1]).toBeLessThan(1);
  });

  test("histogram bins cover every value", () => {
    const vals = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 10 + i / 10);
    const h = S.histogram(vals);
    expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(200);
    expect(h.bins.length).toBeGreaterThanOrEqual(5);
  });

  test("average ranks for ties", () => {
    expect(S.rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
});
