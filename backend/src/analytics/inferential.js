const jStat = require("jstat");
const ss = require("simple-statistics");
const { AnalysisError } = require("./errors");
const { summarise, round } = require("./descriptive");

const ALPHA = 0.05;
const twoSided = (t, df) => 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
const tCritical = (df) => jStat.studentt.inv(1 - ALPHA / 2, df);

function requireSize(values, min, label) {
  if (values.length < min) {
    throw new AnalysisError(`${label} needs at least ${min} observations. Found ${values.length}.`);
  }
}

function skewWarning(values, label, assumptions) {
  if (values.length >= 3 && Math.abs(ss.sampleSkewness(values)) > 2) {
    assumptions.push(`${label} is strongly skewed. The normality assumption may not hold. Interpret the result with caution.`);
  }
}

function varianceRatioWarning(groups, assumptions) {
  const variances = groups.map((g) => ss.sampleVariance(g.values)).filter((v) => v > 0);
  if (variances.length >= 2 && Math.max(...variances) / Math.min(...variances) > 4) {
    assumptions.push("Group variances differ by more than a factor of 4. Equal-variance assumptions may not hold.");
  }
}

/** Welch's independent-samples t-test. It does not assume equal variances. */
function independentTTest(groupA, groupB, labels) {
  requireSize(groupA, 2, `Group "${labels[0]}"`);
  requireSize(groupB, 2, `Group "${labels[1]}"`);
  const assumptions = [];
  skewWarning(groupA, `Group "${labels[0]}"`, assumptions);
  skewWarning(groupB, `Group "${labels[1]}"`, assumptions);
  assumptions.push("Welch's test is used, so equal variances are not assumed. Observations are assumed independent.");

  const na = groupA.length;
  const nb = groupB.length;
  const ma = ss.mean(groupA);
  const mb = ss.mean(groupB);
  const va = ss.sampleVariance(groupA);
  const vb = ss.sampleVariance(groupB);
  const seA = va / na;
  const seB = vb / nb;
  const se = Math.sqrt(seA + seB);
  const diff = ma - mb;
  const t = diff / se;
  const df = (seA + seB) ** 2 / (seA ** 2 / (na - 1) + seB ** 2 / (nb - 1));
  const crit = tCritical(df);
  const pooledSd = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));

  return {
    assumptions,
    results: {
      sampleSize: { groupA: na, groupB: nb, total: na + nb },
      meanDifference: round(diff),
      testStatistic: { name: "t", value: round(t) },
      pValue: round(twoSided(t, df)),
      degreesOfFreedom: round(df, 4),
      confidenceInterval: { level: 0.95, lower: round(diff - crit * se), upper: round(diff + crit * se) },
      effectSize: { name: "Cohen's d", value: round(diff / pooledSd) },
      groups: [summarise(groupA), summarise(groupB)].map((s, i) => ({ group: labels[i], ...s })),
    },
  };
}

/** Paired-samples t-test on the element-wise differences. */
function pairedTTest(first, second) {
  if (first.length !== second.length) {
    throw new AnalysisError("Paired columns must contain the same number of complete observations");
  }
  requireSize(first, 2, "Paired analysis");
  const assumptions = ["Pairs are assumed to be matched observations. Differences are assumed approximately normal."];
  const differences = first.map((v, i) => v - second[i]);
  skewWarning(differences, "The paired differences", assumptions);

  const n = differences.length;
  const md = ss.mean(differences);
  const sd = ss.sampleStandardDeviation(differences);
  if (sd === 0) throw new AnalysisError("All paired differences are identical. The t-test is undefined.");
  const se = sd / Math.sqrt(n);
  const t = md / se;
  const df = n - 1;
  const crit = tCritical(df);
  return {
    assumptions,
    results: {
      sampleSize: { pairs: n },
      meanDifference: round(md),
      testStatistic: { name: "t", value: round(t) },
      pValue: round(twoSided(t, df)),
      degreesOfFreedom: df,
      confidenceInterval: { level: 0.95, lower: round(md - crit * se), upper: round(md + crit * se) },
      effectSize: { name: "Cohen's dz", value: round(md / sd) },
    },
  };
}

/** Pearson chi-square test of independence for two categorical variables. */
function chiSquareTest(pairs) {
  const rowLevels = [...new Set(pairs.map((p) => p[0]))].sort();
  const colLevels = [...new Set(pairs.map((p) => p[1]))].sort();
  if (rowLevels.length < 2 || colLevels.length < 2) {
    throw new AnalysisError("Chi-square needs at least 2 levels in each variable");
  }
  const observed = rowLevels.map(() => colLevels.map(() => 0));
  for (const [r, c] of pairs) {
    observed[rowLevels.indexOf(r)][colLevels.indexOf(c)] += 1;
  }
  const N = pairs.length;
  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = colLevels.map((_, j) => observed.reduce((sum, row) => sum + row[j], 0));

  let chi2 = 0;
  let smallCells = 0;
  const cells = rowLevels.length * colLevels.length;
  for (let i = 0; i < rowLevels.length; i += 1) {
    for (let j = 0; j < colLevels.length; j += 1) {
      const expected = (rowTotals[i] * colTotals[j]) / N;
      if (expected < 5) smallCells += 1;
      chi2 += (observed[i][j] - expected) ** 2 / expected;
    }
  }
  const df = (rowLevels.length - 1) * (colLevels.length - 1);
  const pValue = 1 - jStat.chisquare.cdf(chi2, df);
  const cramersV = Math.sqrt(chi2 / (N * Math.min(rowLevels.length - 1, colLevels.length - 1)));

  const assumptions = [];
  if (smallCells / cells > 0.2) {
    assumptions.push(`${smallCells} of ${cells} expected cell counts are below 5. The chi-square approximation may be unreliable. Combine sparse categories or use an exact test.`);
  }
  assumptions.push("Each observation is assumed to belong to exactly one row and one column category.");

  return {
    assumptions,
    results: {
      sampleSize: { total: N },
      testStatistic: { name: "chi-square", value: round(chi2) },
      pValue: round(pValue),
      degreesOfFreedom: df,
      effectSize: { name: "Cramer's V", value: round(cramersV) },
      contingencyTable: { rows: rowLevels, columns: colLevels, observed },
    },
  };
}

/** One-way ANOVA. Groups are compared on the mean of a numeric outcome. */
function oneWayAnova(groups) {
  if (groups.length < 2) throw new AnalysisError("ANOVA needs at least 2 groups");
  groups.forEach((g) => requireSize(g.values, 2, `Group "${g.label}"`));
  const assumptions = ["Observations are assumed independent. Residuals are assumed approximately normal within each group."];
  varianceRatioWarning(groups, assumptions);
  groups.forEach((g) => skewWarning(g.values, `Group "${g.label}"`, assumptions));

  const all = groups.flatMap((g) => g.values);
  const N = all.length;
  const k = groups.length;
  const grandMean = ss.mean(all);
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of groups) {
    const m = ss.mean(g.values);
    ssBetween += g.values.length * (m - grandMean) ** 2;
    ssWithin += (g.values.length - 1) * ss.sampleVariance(g.values);
  }
  const dfBetween = k - 1;
  const dfWithin = N - k;
  if (dfWithin < 1) throw new AnalysisError("Not enough observations for ANOVA");
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const F = msBetween / msWithin;
  const pValue = 1 - jStat.centralF.cdf(F, dfBetween, dfWithin);

  return {
    assumptions,
    results: {
      sampleSize: { total: N, perGroup: groups.map((g) => ({ group: g.label, n: g.values.length })) },
      testStatistic: { name: "F", value: round(F) },
      pValue: round(pValue),
      degreesOfFreedom: { between: dfBetween, within: dfWithin },
      effectSize: { name: "eta squared", value: round(ssBetween / (ssBetween + ssWithin)) },
      groups: groups.map((g) => ({ group: g.label, ...summarise(g.values) })),
    },
  };
}

module.exports = { independentTTest, pairedTTest, chiSquareTest, oneWayAnova, twoSided, tCritical, ALPHA };
