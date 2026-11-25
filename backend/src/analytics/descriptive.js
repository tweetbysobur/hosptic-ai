const ss = require("simple-statistics");

const round = (value, digits = 6) => (value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits)));

function summarise(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  const q1 = ss.quantileSorted(sorted, 0.25);
  const q3 = ss.quantileSorted(sorted, 0.75);
  return {
    sampleSize: n,
    mean: round(ss.mean(sorted)),
    median: round(ss.median(sorted)),
    standardDeviation: n > 1 ? round(ss.sampleStandardDeviation(sorted)) : null,
    variance: n > 1 ? round(ss.sampleVariance(sorted)) : null,
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
    q1: round(q1),
    q3: round(q3),
    iqr: round(q3 - q1),
    skewness: n > 2 ? round(ss.sampleSkewness(sorted)) : null,
  };
}

function modeOf(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function frequencyTable(labels) {
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  const total = labels.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([label, count]) => ({ label, count, percent: round((count / total) * 100, 2) }));
}

/** Sturges' rule histogram. Bin edges are deterministic for the same data. */
function histogram(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const min = sorted[0];
  const max = sorted[n - 1];
  if (min === max) return [{ start: round(min), end: round(max), count: n }];
  const bins = Math.max(1, Math.ceil(Math.log2(n) + 1));
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ start: round(min + i * width), end: round(min + (i + 1) * width), count: 0 }));
  for (const v of sorted) {
    const index = Math.min(bins - 1, Math.floor((v - min) / width));
    out[index].count += 1;
  }
  return out;
}

module.exports = { summarise, modeOf, frequencyTable, histogram, round };
