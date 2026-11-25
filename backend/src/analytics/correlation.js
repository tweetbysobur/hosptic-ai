const jStat = require("jstat");
const ss = require("simple-statistics");
const { AnalysisError } = require("./errors");
const { round } = require("./descriptive");
const { twoSided, tCritical } = require("./inferential");

function pearsonR(x, y) {
  const mx = ss.mean(x);
  const my = ss.mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) throw new AnalysisError("One variable is constant. Correlation is undefined.");
  return { r: sxy / Math.sqrt(sxx * syy), sxy, sxx, syy, mx, my };
}

/** Average ranks for ties. */
function ranks(values) {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

function correlationResults(r, n, method) {
  const df = n - 2;
  const clamped = Math.max(-0.999999999999, Math.min(0.999999999999, r));
  const t = clamped * Math.sqrt(df / (1 - clamped * clamped));
  const pValue = Math.abs(r) >= 1 ? 0 : twoSided(t, df);
  let confidenceInterval = null;
  if (n > 3) {
    const z = Math.atanh(clamped);
    const se = 1 / Math.sqrt(n - 3);
    const crit = jStat.normal.inv(0.975, 0, 1);
    confidenceInterval = { level: 0.95, lower: round(Math.tanh(z - crit * se)), upper: round(Math.tanh(z + crit * se)) };
  }
  return {
    sampleSize: { pairs: n },
    testStatistic: { name: method === "pearson" ? "t" : "t (approximate)", value: round(t) },
    pValue: round(pValue),
    degreesOfFreedom: df,
    confidenceInterval,
    effectSize: { name: method === "pearson" ? "Pearson r" : "Spearman rho", value: round(r) },
  };
}

function requireN(n) {
  if (n < 3) throw new AnalysisError(`Correlation needs at least 3 complete pairs. Found ${n}.`);
}

function pearsonCorrelation(x, y) {
  requireN(x.length);
  const { r } = pearsonR(x, y);
  const assumptions = [
    "Pearson's r measures linear association only. A scatter plot should show a roughly linear pattern.",
    "Pairs are assumed independent and approximately bivariate normal.",
  ];
  if (x.length >= 3 && (Math.abs(ss.sampleSkewness(x)) > 2 || Math.abs(ss.sampleSkewness(y)) > 2)) {
    assumptions.push("One variable is strongly skewed. Spearman correlation may be more appropriate.");
  }
  return { assumptions, results: correlationResults(r, x.length, "pearson") };
}

function spearmanCorrelation(x, y) {
  requireN(x.length);
  const { r } = pearsonR(ranks(x), ranks(y));
  return {
    assumptions: [
      "Spearman's rho measures monotonic association using ranks. It does not require normality.",
      "The p-value uses a t approximation, which is less exact for small samples.",
    ],
    results: correlationResults(r, x.length, "spearman"),
  };
}

function linearRegression(x, y) {
  requireN(x.length);
  const n = x.length;
  const { sxy, sxx, syy, mx, my } = pearsonR(x, y);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  const residuals = [];
  for (let i = 0; i < n; i += 1) {
    const e = y[i] - (intercept + slope * x[i]);
    residuals.push(e);
    sse += e * e;
  }
  const df = n - 2;
  const mse = sse / df;
  const seSlope = Math.sqrt(mse / sxx);
  const seIntercept = Math.sqrt(mse * (1 / n + (mx * mx) / sxx));
  const t = slope / seSlope;
  const crit = tCritical(df);
  const r2 = 1 - sse / syy;

  const assumptions = [
    "The relationship is assumed linear. Residuals are assumed independent with constant variance and approximately normal distribution.",
  ];
  if (n >= 3 && Math.abs(ss.sampleSkewness(residuals)) > 2) {
    assumptions.push("Residuals are strongly skewed. Predictions and confidence intervals may be unreliable.");
  }
  return {
    assumptions,
    results: {
      sampleSize: { pairs: n },
      coefficients: {
        intercept: { estimate: round(intercept), standardError: round(seIntercept) },
        slope: {
          estimate: round(slope),
          standardError: round(seSlope),
          testStatistic: round(t),
          pValue: round(twoSided(t, df)),
          confidenceInterval: { level: 0.95, lower: round(slope - crit * seSlope), upper: round(slope + crit * seSlope) },
        },
      },
      rSquared: round(r2),
      testStatistic: { name: "t (slope)", value: round(t) },
      pValue: round(twoSided(t, df)),
      degreesOfFreedom: df,
      effectSize: { name: "R squared", value: round(r2) },
      residualStandardError: round(Math.sqrt(mse)),
    },
    fit: { slope, intercept },
  };
}

module.exports = { pearsonCorrelation, spearmanCorrelation, linearRegression, pearsonR, ranks };
