// Deterministic statistical tests. Distributions come from jStat, summaries
// from Simple Statistics. Every function takes plain arrays and returns plain
// numbers; nothing here calls a language model.
const { jStat } = require("jstat");
const ss = require("simple-statistics");

// Tail probabilities via the regularised incomplete beta function, which keeps
// precision for very small p-values where 1 - cdf would round to zero.
const tTwoSided = (t, df) => (Number.isFinite(t) ? Math.min(1, jStat.ibeta(df / (df + t * t), df / 2, 0.5)) : 0);
const tCrit = (df, conf = 0.95) => jStat.studentt.inv(1 - (1 - conf) / 2, df);
const zCrit = (conf = 0.95) => jStat.normal.inv(1 - (1 - conf) / 2, 0, 1);
const fUpper = (f, d1, d2) => (f <= 0 ? 1 : Number.isFinite(f) ? jStat.ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2) : 0);
const chiUpper = (x, df) => (x <= 0 ? 1 : 1 - jStat.chisquare.cdf(x, df));

const variance = (a) => (a.length > 1 ? ss.sampleVariance(a) : NaN);
const sd = (a) => Math.sqrt(variance(a));

function skewness(a) {
  if (a.length < 3) return NaN;
  const s = sd(a);
  return s === 0 ? 0 : ss.sampleSkewness(a);
}

// Normality screen used for assumption checks. With no Shapiro-Wilk in the
// stack we use sample skewness and excess kurtosis, which is documented as a
// limitation in methodology output.
function normalityScreen(a) {
  const n = a.length;
  const skew = skewness(a);
  const kurt = n >= 4 && sd(a) > 0 ? ss.sampleKurtosis(a) : NaN;
  const severe = Math.abs(skew) > 2 || Math.abs(kurt) > 7;
  const moderate = Math.abs(skew) > 1;
  return {
    n,
    skewness: skew,
    excessKurtosis: kurt,
    concern: n < 30 ? (moderate ? "likely_non_normal_small_sample" : "none") : severe ? "heavy_departure" : "none",
  };
}

// ---------------------------------------------------------------- descriptive

function describe(values) {
  const n = values.length;
  if (!n) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const modes = (() => {
    const counts = new Map();
    for (const x of values) counts.set(x, (counts.get(x) || 0) + 1);
    const max = Math.max(...counts.values());
    if (max === 1) return [];
    return [...counts.entries()].filter(([, c]) => c === max).map(([x]) => x).slice(0, 5);
  })();
  const mean = ss.mean(values);
  const s = n > 1 ? ss.sampleStandardDeviation(values) : NaN;
  const se = s / Math.sqrt(n);
  const tc = n > 1 ? tCrit(n - 1) : NaN;
  return {
    n,
    mean,
    median: ss.medianSorted(sorted),
    mode: modes,
    sd: s,
    variance: n > 1 ? ss.sampleVariance(values) : NaN,
    min: sorted[0],
    max: sorted[n - 1],
    q1: ss.quantileSorted(sorted, 0.25),
    q3: ss.quantileSorted(sorted, 0.75),
    iqr: ss.quantileSorted(sorted, 0.75) - ss.quantileSorted(sorted, 0.25),
    skewness: skewness(values),
    meanCi95: n > 1 ? [mean - tc * se, mean + tc * se] : null,
  };
}

function frequencies(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const n = values.length;
  const z = zCrit();
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => {
      const p = count / n;
      // Wilson score interval for each proportion.
      const denom = 1 + (z * z) / n;
      const centre = (p + (z * z) / (2 * n)) / denom;
      const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
      return { value, count, proportion: p, ci95: [Math.max(0, centre - half), Math.min(1, centre + half)] };
    });
}

// ----------------------------------------------------------------- comparison

// Welch's t-test (does not assume equal variances).
function independentT(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = ss.mean(a);
  const m2 = ss.mean(b);
  const v1 = variance(a);
  const v2 = variance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = (m1 - m2) / se;
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const diff = m1 - m2;
  const tc = tCrit(df);
  const pooled = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = diff / pooled;
  const hedgesG = d * (1 - 3 / (4 * (n1 + n2) - 9));
  return {
    t,
    df,
    pValue: tTwoSided(t, df),
    meanDifference: diff,
    ci95: [diff - tc * se, diff + tc * se],
    standardError: se,
    cohensD: d,
    hedgesG,
  };
}

function pairedT(a, b) {
  const diffs = a.map((x, i) => x - b[i]);
  const n = diffs.length;
  const m = ss.mean(diffs);
  const s = sd(diffs);
  const se = s / Math.sqrt(n);
  const t = m / se;
  const df = n - 1;
  const tc = tCrit(df);
  return { t, df, pValue: tTwoSided(t, df), meanDifference: m, sdDifference: s, ci95: [m - tc * se, m + tc * se], cohensDz: m / s, diffs };
}

// Average ranks with ties.
function rank(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    i = j + 1;
  }
  return ranks;
}

// Mann-Whitney U with normal approximation and tie correction. Reported as a
// robustness check next to the t-test when normality is in doubt.
function mannWhitney(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const all = [...a, ...b];
  const r = rank(all);
  const r1 = r.slice(0, n1).reduce((s, x) => s + x, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);
  const counts = new Map();
  for (const x of all) counts.set(x, (counts.get(x) || 0) + 1);
  const N = n1 + n2;
  const tie = [...counts.values()].reduce((s, t) => s + (t ** 3 - t), 0);
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tie / (N * (N - 1))));
  const z = sigma === 0 ? 0 : (u1 - (n1 * n2) / 2 - Math.sign(u1 - (n1 * n2) / 2) * 0.5) / sigma;
  return { U: u, z, pValue: 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1)), rankBiserial: 1 - (2 * u) / (n1 * n2) };
}

// Brown-Forsythe variant of Levene's test (deviations from the median).
function levene(groups) {
  const dev = groups.map((g) => {
    const med = ss.median(g);
    return g.map((x) => Math.abs(x - med));
  });
  const r = anovaCore(dev);
  return { F: r.F, df1: r.df1, df2: r.df2, pValue: r.pValue };
}

function anovaCore(groups) {
  const all = groups.flat();
  const N = all.length;
  const k = groups.length;
  const grand = ss.mean(all);
  let ssb = 0;
  let ssw = 0;
  for (const g of groups) {
    const m = ss.mean(g);
    ssb += g.length * (m - grand) ** 2;
    for (const x of g) ssw += (x - m) ** 2;
  }
  const df1 = k - 1;
  const df2 = N - k;
  const msb = ssb / df1;
  const msw = ssw / df2;
  const F = msw === 0 ? (msb === 0 ? 0 : Infinity) : msb / msw;
  return { F, df1, df2, pValue: Number.isFinite(F) ? fUpper(F, df1, df2) : 0, ssBetween: ssb, ssWithin: ssw, msWithin: msw };
}

function welchAnova(groups) {
  const k = groups.length;
  const w = groups.map((g) => g.length / variance(g));
  const W = w.reduce((s, x) => s + x, 0);
  const means = groups.map((g) => ss.mean(g));
  const mw = w.reduce((s, x, i) => s + x * means[i], 0) / W;
  const a = w.reduce((s, x, i) => s + x * (means[i] - mw) ** 2, 0) / (k - 1);
  const lam = groups.reduce((s, g, i) => s + (1 - w[i] / W) ** 2 / (g.length - 1), 0);
  const b = 1 + ((2 * (k - 2)) / (k * k - 1)) * lam;
  const F = a / b;
  const df2 = (k * k - 1) / (3 * lam);
  return { F, df1: k - 1, df2, pValue: fUpper(F, k - 1, df2) };
}

function oneWayAnova(groups) {
  const core = anovaCore(groups);
  const ssTotal = core.ssBetween + core.ssWithin;
  const etaSquared = ssTotal === 0 ? 0 : core.ssBetween / ssTotal;
  const omegaSquared = Math.max(0, (core.ssBetween - core.df1 * core.msWithin) / (ssTotal + core.msWithin));
  return { ...core, etaSquared, omegaSquared };
}

// ------------------------------------------------------------- categorical

function crosstab(xs, ys) {
  const rowLevels = [...new Set(xs)].sort();
  const colLevels = [...new Set(ys)].sort();
  const table = rowLevels.map(() => colLevels.map(() => 0));
  xs.forEach((x, i) => {
    table[rowLevels.indexOf(x)][colLevels.indexOf(ys[i])]++;
  });
  return { rowLevels, colLevels, table };
}

function logFactorial(n) {
  return jStat.gammaln(n + 1);
}

// Two-sided Fisher's exact test for a 2x2 table.
function fisherExact2x2([[a, b], [c, d]]) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const logP = (x) =>
    logFactorial(r1) + logFactorial(r2) + logFactorial(c1) + logFactorial(n - c1) -
    logFactorial(n) - logFactorial(x) - logFactorial(r1 - x) - logFactorial(c1 - x) - logFactorial(r2 - c1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

function chiSquare(table) {
  const R = table.length;
  const C = table[0].length;
  const rowSums = table.map((r) => r.reduce((s, x) => s + x, 0));
  const colSums = table[0].map((_, j) => table.reduce((s, r) => s + r[j], 0));
  const N = rowSums.reduce((s, x) => s + x, 0);
  const expected = table.map((r, i) => r.map((_, j) => (rowSums[i] * colSums[j]) / N));
  let chi2 = 0;
  table.forEach((r, i) => r.forEach((o, j) => (chi2 += (o - expected[i][j]) ** 2 / expected[i][j])));
  const df = (R - 1) * (C - 1);
  const flat = expected.flat();
  const lowExpected = flat.filter((e) => e < 5).length;
  const out = {
    chiSquare: chi2,
    df,
    pValue: chiUpper(chi2, df),
    n: N,
    cramersV: Math.sqrt(chi2 / (N * Math.min(R - 1, C - 1))),
    expected,
    cellsExpectedBelow5: lowExpected,
    shareExpectedBelow5: lowExpected / flat.length,
    minExpected: Math.min(...flat),
  };
  if (R === 2 && C === 2) {
    const [[a, b], [c, d]] = table;
    out.fisherExactP = fisherExact2x2(table);
    // Odds ratio with Haldane-Anscombe correction when a cell is zero.
    const adj = [a, b, c, d].some((x) => x === 0) ? 0.5 : 0;
    const or = ((a + adj) * (d + adj)) / ((b + adj) * (c + adj));
    const seLog = Math.sqrt(1 / (a + adj) + 1 / (b + adj) + 1 / (c + adj) + 1 / (d + adj));
    out.oddsRatio = or;
    out.oddsRatioCi95 = [Math.exp(Math.log(or) - zCrit() * seLog), Math.exp(Math.log(or) + zCrit() * seLog)];
  }
  return out;
}

// ------------------------------------------------------------- relationships

function pearson(x, y) {
  const n = x.length;
  const r = ss.sampleCorrelation(x, y);
  const df = n - 2;
  const t = Math.abs(r) === 1 ? Infinity : (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  const z = Math.atanh(Math.max(-0.999999999, Math.min(0.999999999, r)));
  const se = 1 / Math.sqrt(n - 3);
  return {
    r,
    rSquared: r * r,
    n,
    t,
    df,
    pValue: Number.isFinite(t) ? tTwoSided(t, df) : 0,
    ci95: n > 3 ? [Math.tanh(z - zCrit() * se), Math.tanh(z + zCrit() * se)] : null,
  };
}

function spearman(x, y) {
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  const rho = ss.sampleCorrelation(rx, ry);
  const df = n - 2;
  const t = Math.abs(rho) === 1 ? Infinity : (rho * Math.sqrt(df)) / Math.sqrt(1 - rho * rho);
  // Fieller, Hartley and Pearson standard error for the Fisher-z interval.
  const z = Math.atanh(Math.max(-0.999999999, Math.min(0.999999999, rho)));
  const se = Math.sqrt(1.06 / (n - 3));
  return {
    rho,
    n,
    t,
    df,
    pValue: Number.isFinite(t) ? tTwoSided(t, df) : 0,
    ci95: n > 3 ? [Math.tanh(z - zCrit() * se), Math.tanh(z + zCrit() * se)] : null,
  };
}

function linearRegression(x, y) {
  const n = x.length;
  const mx = ss.mean(x);
  const my = ss.mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const residuals = y.map((yi, i) => yi - (intercept + slope * x[i]));
  const sse = residuals.reduce((s, e) => s + e * e, 0);
  const df = n - 2;
  const s2 = sse / df;
  const seSlope = Math.sqrt(s2 / sxx);
  const seIntercept = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));
  const tc = tCrit(df);
  const tSlope = slope / seSlope;
  const tIntercept = intercept / seIntercept;
  const rSquared = syy === 0 ? 0 : 1 - sse / syy;
  const residualSd = Math.sqrt(s2);
  return {
    n,
    df,
    slope,
    intercept,
    slopeSe: seSlope,
    interceptSe: seIntercept,
    slopeT: tSlope,
    interceptT: tIntercept,
    slopePValue: tTwoSided(tSlope, df),
    interceptPValue: tTwoSided(tIntercept, df),
    slopeCi95: [slope - tc * seSlope, slope + tc * seSlope],
    interceptCi95: [intercept - tc * seIntercept, intercept + tc * seIntercept],
    rSquared,
    adjustedRSquared: 1 - ((1 - rSquared) * (n - 1)) / df,
    residualStandardError: residualSd,
    F: tSlope * tSlope,
    fPValue: fUpper(tSlope * tSlope, 1, df),
    residuals,
    largeStandardisedResiduals: residuals.filter((e) => Math.abs(e / residualSd) > 3).length,
  };
}

// ------------------------------------------------------------- distribution

function histogram(values, maxBins = 30) {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  if (min === max) return { bins: [{ start: min, end: max, count: n }], method: "single_value" };
  const iqr = ss.quantileSorted(sorted, 0.75) - ss.quantileSorted(sorted, 0.25);
  let k;
  let method;
  if (iqr > 0) {
    const width = (2 * iqr) / Math.cbrt(n);
    k = Math.ceil((max - min) / width);
    method = "freedman_diaconis";
  } else {
    k = Math.ceil(Math.log2(n) + 1);
    method = "sturges";
  }
  k = Math.max(5, Math.min(maxBins, k));
  const w = (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({ start: min + i * w, end: min + (i + 1) * w, count: 0 }));
  for (const x of values) bins[Math.min(k - 1, Math.floor((x - min) / w))].count++;
  return { bins, method };
}

module.exports = {
  describe,
  frequencies,
  independentT,
  pairedT,
  mannWhitney,
  levene,
  oneWayAnova,
  welchAnova,
  crosstab,
  chiSquare,
  fisherExact2x2,
  pearson,
  spearman,
  linearRegression,
  histogram,
  normalityScreen,
  rank,
};
