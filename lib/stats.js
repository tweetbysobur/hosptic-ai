// Statistical primitives used by the analysis engine.
// Everything here is computed from the data; nothing is approximated by hand.

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);

export function variance(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
}
export const sd = (a) => Math.sqrt(variance(a));

export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const median = (a) => quantile(a, 0.5);

export function fiveNumber(a) {
  const q1 = quantile(a, 0.25);
  const q3 = quantile(a, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inside = a.filter((x) => x >= lowFence && x <= highFence);
  return {
    min: Math.min(...inside),
    q1,
    median: median(a),
    q3,
    max: Math.max(...inside),
    outliers: a.length - inside.length,
  };
}

// ---------- special functions ----------

function logGamma(x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Regularized lower incomplete gamma P(a, x)
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let s = del;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-14) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // continued fraction for Q, return 1 - Q
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function betacf(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b)
function betaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export const chiSquareP = (x, df) => 1 - gammaP(df / 2, x / 2);
export const tTwoSidedP = (t, df) => betaI(df / 2, 0.5, df / (df + t * t));
export const fP = (f, d1, d2) => betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}
export const zTwoSidedP = (z) => 2 * (1 - normalCdf(Math.abs(z)));

// Inverse t quantile (two-sided 95% by default) via bisection
export function tCritical(df, conf = 0.95) {
  const target = 1 - conf;
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- tests ----------

// Wilson score interval for a proportion
export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const adj = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - adj) / denom, (centre + adj) / denom];
}

// Chi-square test of independence for an r x c table of counts
export function chiSquareTest(table) {
  const rows = table.length;
  const cols = table[0].length;
  const rowT = table.map((r) => sum(r));
  const colT = table[0].map((_, j) => sum(table.map((r) => r[j])));
  const n = sum(rowT);
  let chi = 0;
  let minExpected = Infinity;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const e = (rowT[i] * colT[j]) / n;
      minExpected = Math.min(minExpected, e);
      if (e > 0) chi += (table[i][j] - e) ** 2 / e;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = chiSquareP(chi, df);
  const cramersV = Math.sqrt(chi / (n * (Math.min(rows, cols) - 1)));
  return { chi, df, p, n, cramersV, minExpected };
}

// Welch's t-test
export function welchT(a, b) {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  const t = (ma - mb) / se;
  const df = (va / a.length + vb / b.length) ** 2 /
    ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  const p = tTwoSidedP(t, df);
  const crit = tCritical(df);
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  return {
    t, df, p,
    diff: ma - mb,
    ci: [ma - mb - crit * se, ma - mb + crit * se],
    cohensD: (ma - mb) / pooled,
  };
}

// One-way ANOVA
export function anova(groups) {
  const all = groups.flat();
  const gm = mean(all);
  const k = groups.length;
  const n = all.length;
  const ssb = sum(groups.map((g) => g.length * (mean(g) - gm) ** 2));
  const ssw = sum(groups.map((g) => { const m = mean(g); return sum(g.map((x) => (x - m) ** 2)); }));
  const d1 = k - 1;
  const d2 = n - k;
  const f = ssb / d1 / (ssw / d2);
  const sds = groups.map(sd);
  return { f, d1, d2, p: fP(f, d1, d2), etaSquared: ssb / (ssb + ssw), sdRatio: Math.max(...sds) / Math.min(...sds) };
}

// Pearson correlation with Fisher-z confidence interval
export function pearson(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  const n = x.length;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  const p = tTwoSidedP(t, n - 2);
  const z = Math.atanh(r);
  const se = 1 / Math.sqrt(n - 3);
  const slope = sxy / sxx;
  return { r, n, t, df: n - 2, p, ci: [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)], slope, intercept: my - slope * mx };
}

// Risk ratio with log-method CI: exposed (a events / n1) vs unexposed (c events / n0)
export function riskRatio(a, n1, c, n0) {
  const r1 = a / n1;
  const r0 = c / n0;
  const rr = r1 / r0;
  const se = Math.sqrt(1 / a - 1 / n1 + 1 / c - 1 / n0);
  const z = Math.log(rr) / se;
  return { rr, r1, r0, ci: [Math.exp(Math.log(rr) - 1.96 * se), Math.exp(Math.log(rr) + 1.96 * se)], p: zTwoSidedP(z) };
}

// Two-proportion z-test
export function twoPropZ(k1, n1, k2, n2) {
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = (p1 - p2) / se;
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return { z, p: zTwoSidedP(z), diff: p1 - p2, ci: [p1 - p2 - 1.96 * seDiff, p1 - p2 + 1.96 * seDiff] };
}

// Holm-Bonferroni adjustment
export function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const m = ps.length;
  const out = new Array(m);
  let running = 0;
  idx.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, p * (m - rank)));
    out[i] = running;
  });
  return out;
}

// ---------- formatting ----------
export const fmtP = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export const r2 = (x, d = 2) => Number(x.toFixed(d));
