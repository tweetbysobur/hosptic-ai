// PDF report rendering with PDFKit. Draws only what the stored analysis
// contains; nothing is recomputed or invented here.
const PDFDocument = require("pdfkit");

// Colours from the frontend tokens (app/globals.css).
const C = {
  ink: "#1c1917",
  muted: "#57534e",
  border: "#e7e5e4",
  grid: "#eeecea",
  brand: "#e11d48",
  brandInk: "#be123c",
  chart: "#475569",
  chartSoft: "#cbd5e1",
  markBg: "#0c0a09",
  markRed: "#ff1f45",
  good: "#15803d",
  warn: "#b45309",
};

const M = 50; // page margin
const fmt = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? "-" : Number(x).toFixed(d));
const fmtP = (p) => (p === null || p === undefined ? "-" : p < 0.001 ? "< 0.001" : Number(p).toFixed(3));
const human = (s) => String(s || "").replace(/_/g, " ");

// The Hosptic mark, same geometry as components/Logo.js.
function drawMark(doc, x, y, size) {
  const s = size / 32;
  doc.save();
  doc.roundedRect(x, y, 32 * s, 32 * s, 8 * s).fill(C.markBg);
  doc.roundedRect(x + 8.5 * s, y + 7 * s, 4.2 * s, 18 * s, 2.1 * s).fill(C.markRed);
  doc.roundedRect(x + 19.3 * s, y + 7 * s, 4.2 * s, 18 * s, 2.1 * s).fill(C.markRed);
  const pts = [[4, 17.2], [11.2, 17.2], [12.8, 19.4], [15.2, 12.8], [17.8, 21.2], [19.7, 16.4], [28, 16.4]];
  doc.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
  for (const [px, py] of pts.slice(1)) doc.lineTo(x + px * s, y + py * s);
  doc.lineWidth(2.6 * s).lineCap("round").lineJoin("round").strokeColor(C.markBg).stroke();
  doc.restore();
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - M - 30) doc.addPage();
}

function heading(doc, text) {
  ensureSpace(doc, 60);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.ink).text(text, M);
  const y = doc.y + 3;
  doc.moveTo(M, y).lineTo(doc.page.width - M, y).lineWidth(0.5).strokeColor(C.border).stroke();
  doc.y = y + 8;
}

function para(doc, text, opts = {}) {
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size || 10).fillColor(opts.color || C.ink);
  doc.text(text, M, doc.y, { width: doc.page.width - 2 * M, lineGap: 2, ...opts });
}

function keyValues(doc, rows) {
  const width = doc.page.width - 2 * M;
  for (const [k, v] of rows) {
    if (v === undefined || v === null || v === "") continue;
    ensureSpace(doc, 18);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(C.muted).text(k, M, y, { width: 170 });
    doc.font("Helvetica").fontSize(9.5).fillColor(C.ink).text(String(v), M + 175, y, { width: width - 175 });
    doc.y = Math.max(doc.y, y + 14);
  }
}

function table(doc, header, rows, widths) {
  const width = doc.page.width - 2 * M;
  const w = widths || header.map(() => width / header.length);
  const row = (cells, bold) => {
    ensureSpace(doc, 18);
    const y = doc.y;
    let x = M;
    let h = 14;
    cells.forEach((cell, i) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(C.ink);
      doc.text(String(cell ?? "-"), x + 3, y + 3, { width: w[i] - 6 });
      h = Math.max(h, doc.y - y + 3);
      x += w[i];
    });
    doc.moveTo(M, y + h).lineTo(M + width, y + h).lineWidth(0.5).strokeColor(C.border).stroke();
    doc.y = y + h + 1;
  };
  row(header, true);
  rows.forEach((r) => row(r, false));
  doc.moveDown(0.5);
}

// ------------------------------------------------------------------ charts

function chartFrame(doc, title, height = 180) {
  ensureSpace(doc, height + 40);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text(title, M, doc.y);
  const top = doc.y + 6;
  return { x: M + 40, y: top, w: doc.page.width - 2 * M - 50, h: height };
}

// Round tick step (1, 2 or 5 x 10^k) so labels read 0, 10, 20 rather than 30.1.
function niceStep(range, ticks = 4) {
  const raw = range / ticks || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

// Draws grid and labels; returns the rounded [min, max] the chart must use.
function yAxis(doc, f, min, max) {
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step || step;
  doc.font("Helvetica").fontSize(7).fillColor(C.muted);
  for (let v = lo; v <= hi + step / 2; v += step) {
    const y = f.y + f.h - ((v - lo) / (hi - lo)) * f.h;
    doc.moveTo(f.x, y).lineTo(f.x + f.w, y).lineWidth(0.4).strokeColor(C.grid).stroke();
    doc.text(Number(v.toPrecision(6)).toString(), M, y - 4, { width: 36, align: "right" });
  }
  return [lo, hi];
}

function bars(doc, title, data, { format = (v) => v } = {}) {
  if (!data.length) return;
  const f = chartFrame(doc, title);
  const [, max] = yAxis(doc, f, 0, Math.max(...data.map((d) => d.value), 0) || 1);
  const bw = f.w / data.length;
  data.forEach((d, i) => {
    const h = (d.value / max) * f.h;
    doc.rect(f.x + i * bw + bw * 0.15, f.y + f.h - h, bw * 0.7, h).fill(i === 0 ? C.brand : C.chart);
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(String(d.label).slice(0, 18), f.x + i * bw, f.y + f.h + 3, { width: bw, align: "center" });
    doc.text(format(d.value), f.x + i * bw, f.y + f.h - h - 10, { width: bw, align: "center" });
  });
  doc.y = f.y + f.h + 22;
}

function histogram(doc, title, bins) {
  if (!bins?.length) return;
  const f = chartFrame(doc, title);
  const [, max] = yAxis(doc, f, 0, Math.max(...bins.map((b) => b.count)) || 1);
  const bw = f.w / bins.length;
  bins.forEach((b, i) => {
    const h = (b.count / max) * f.h;
    doc.rect(f.x + i * bw + 0.5, f.y + f.h - h, bw - 1, h).fill(C.chart);
  });
  doc.font("Helvetica").fontSize(7).fillColor(C.muted);
  doc.text(fmt(bins[0].start, 2), f.x - 10, f.y + f.h + 3, { width: 60 });
  doc.text(fmt(bins[bins.length - 1].end, 2), f.x + f.w - 50, f.y + f.h + 3, { width: 60, align: "right" });
  doc.y = f.y + f.h + 22;
}

function groupMeans(doc, title, data) {
  if (!data?.length) return;
  const f = chartFrame(doc, title);
  const [lo, hi] = yAxis(
    doc,
    f,
    Math.min(0, ...data.map((d) => (d.ci95 ? d.ci95[0] : d.mean))),
    Math.max(...data.map((d) => (d.ci95 ? d.ci95[1] : d.mean)))
  );
  const span = hi - lo || 1;
  const bw = f.w / data.length;
  const yOf = (v) => f.y + f.h - ((v - lo) / span) * f.h;
  data.forEach((d, i) => {
    const cx = f.x + i * bw + bw / 2;
    doc.rect(cx - bw * 0.3, yOf(d.mean), bw * 0.6, yOf(lo) - yOf(d.mean)).fill(C.chartSoft);
    if (d.ci95) {
      doc.moveTo(cx, yOf(d.ci95[0])).lineTo(cx, yOf(d.ci95[1])).lineWidth(1).strokeColor(C.ink).stroke();
      doc.moveTo(cx - 5, yOf(d.ci95[0])).lineTo(cx + 5, yOf(d.ci95[0])).stroke();
      doc.moveTo(cx - 5, yOf(d.ci95[1])).lineTo(cx + 5, yOf(d.ci95[1])).stroke();
    }
    doc.circle(cx, yOf(d.mean), 2.5).fill(C.brand);
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(`${String(d.label).slice(0, 16)} (n=${d.n})`, f.x + i * bw, f.y + f.h + 3, { width: bw, align: "center" });
  });
  doc.y = f.y + f.h + 22;
}

function scatter(doc, title, chart) {
  const pts = chart.points || [];
  if (!pts.length) return;
  const f = chartFrame(doc, title, 200);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y).concat((chart.line || []).map((p) => p.y));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = yAxis(doc, f, Math.min(...ys), Math.max(...ys));
  const X = (v) => f.x + ((v - x0) / (x1 - x0 || 1)) * f.w;
  const Y = (v) => f.y + f.h - ((v - y0) / (y1 - y0 || 1)) * f.h;
  doc.fillColor(C.chart).fillOpacity(0.6);
  pts.forEach((p) => doc.circle(X(p.x), Y(p.y), 1.8).fill());
  doc.fillOpacity(1);
  if (chart.line?.length === 2) {
    doc.moveTo(X(chart.line[0].x), Y(chart.line[0].y)).lineTo(X(chart.line[1].x), Y(chart.line[1].y)).lineWidth(1.5).strokeColor(C.brand).stroke();
  }
  doc.font("Helvetica").fontSize(7).fillColor(C.muted);
  doc.text(`${chart.x}: ${fmt(x0, 2)} to ${fmt(x1, 2)}`, f.x, f.y + f.h + 3, { width: f.w, align: "center" });
  doc.y = f.y + f.h + 22;
}

function groupedBars(doc, title, chart) {
  const cats = chart.categories || [];
  const series = chart.data || [];
  if (!cats.length || !series.length) return;
  const f = chartFrame(doc, title);
  yAxis(doc, f, 0, 1);
  const gw = f.w / cats.length;
  const bw = (gw * 0.8) / series.length;
  const palette = [C.brand, C.chart, C.chartSoft, C.muted, C.ink];
  cats.forEach((cat, i) => {
    series.forEach((s, j) => {
      const v = s.values[i] || 0;
      doc.rect(f.x + i * gw + gw * 0.1 + j * bw, f.y + f.h - v * f.h, bw - 1, v * f.h).fill(palette[j % palette.length]);
    });
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(String(cat).slice(0, 18), f.x + i * gw, f.y + f.h + 3, { width: gw, align: "center" });
  });
  let lx = f.x;
  const ly = f.y + f.h + 14;
  series.forEach((s, j) => {
    doc.rect(lx, ly + 1, 7, 7).fill(palette[j % palette.length]);
    doc.font("Helvetica").fontSize(7).fillColor(C.ink).text(`${chart.series}: ${s.label}`, lx + 10, ly, { lineBreak: false });
    lx += 110;
  });
  doc.y = ly + 18;
}

function drawCharts(doc, viz) {
  for (const ch of viz?.charts || []) {
    if (ch.type === "bar") bars(doc, `Frequency of ${ch.column}`, ch.data);
    else if (ch.type === "histogram") histogram(doc, `Distribution of ${ch.column}`, ch.bins);
    else if (ch.type === "group_means") groupMeans(doc, `Mean ${ch.outcome} by ${ch.group} with 95% CI`, ch.data);
    else if (ch.type === "scatter") scatter(doc, `${ch.y} against ${ch.x}${ch.sampled ? " (sample of points)" : ""}`, ch);
    else if (ch.type === "grouped_bar") groupedBars(doc, `${ch.series} within each ${ch.x} (row proportions)`, ch);
  }
}

// ------------------------------------------------------------------ findings

function findings(doc, type, r) {
  const rows = [];
  if (r.sampleSize !== undefined) rows.push(["Sample size", r.sampleSize]);
  if (r.testStatistic) rows.push([`Test statistic (${r.testStatistic.name})`, fmt(r.testStatistic.value)]);
  if (r.degreesOfFreedom !== undefined) {
    rows.push(["Degrees of freedom", typeof r.degreesOfFreedom === "object" ? `${fmt(r.degreesOfFreedom.between, 0)}, ${fmt(r.degreesOfFreedom.within, 0)}` : fmt(r.degreesOfFreedom, 2)]);
  }
  if (r.pValue !== undefined) rows.push(["p-value", fmtP(r.pValue)]);
  if (r.fisherExactP !== undefined) rows.push(["Fisher's exact p-value", fmtP(r.fisherExactP)]);
  if (r.welchAnova) rows.push(["Welch's ANOVA", `F = ${fmt(r.welchAnova.F)}, p = ${fmtP(r.welchAnova.pValue)}`]);
  if (r.meanDifference !== undefined) rows.push([`Mean difference (${r.meanDifferenceLabel})`, fmt(r.meanDifference)]);
  if (r.coefficient) rows.push([`Coefficient (${r.coefficient.name})`, fmt(r.coefficient.value)]);
  if (r.equation) rows.push(["Fitted equation", r.equation]);
  if (r.rSquared !== undefined) rows.push(["R squared", fmt(r.rSquared)]);
  if (r.confidenceInterval95) rows.push(["95% confidence interval", `${fmt(r.confidenceInterval95[0])} to ${fmt(r.confidenceInterval95[1])}`]);
  if (r.oddsRatio !== undefined) rows.push([`Odds ratio (${r.oddsRatioLabel})`, `${fmt(r.oddsRatio)} (95% CI ${fmt(r.oddsRatioCi95[0])} to ${fmt(r.oddsRatioCi95[1])})`]);
  const EFFECT = { cohensD: "Cohen's d", hedgesG: "Hedges' g", cohensDz: "Cohen's dz", etaSquared: "eta squared", omegaSquared: "omega squared", cramersV: "Cramer's V", r: "r", rho: "rho", rSquared: "R squared" };
  if (r.effectSize) rows.push(["Effect size", Object.entries(r.effectSize).map(([k, v]) => `${EFFECT[k] || k} ${fmt(v)}`).join(", ")]);
  if (r.mannWhitney) rows.push(["Mann-Whitney U (robustness check)", `U = ${fmt(r.mannWhitney.U, 1)}, p = ${fmtP(r.mannWhitney.pValue)}`]);
  if (r.significantAtAlpha !== undefined) rows.push(["Significant at 5% level", r.significantAtAlpha ? "Yes" : "No"]);
  keyValues(doc, rows);

  if (r.groups) {
    doc.moveDown(0.4);
    table(doc, ["Group", "n", "Mean", "SD", "Median", "95% CI of mean"], r.groups.map((g) => [g.group, g.n, fmt(g.mean, 2), fmt(g.sd, 2), fmt(g.median, 2), g.meanCi95 ? `${fmt(g.meanCi95[0], 2)} to ${fmt(g.meanCi95[1], 2)}` : "-"]));
  }
  if (r.contingencyTable) {
    doc.moveDown(0.4);
    const ct = r.contingencyTable;
    table(doc, ["", ...ct.columns], ct.rows.map((label, i) => [label, ...ct.counts[i]]));
  }
  if (r.coefficients) {
    doc.moveDown(0.4);
    table(doc, ["Term", "Estimate", "SE", "t", "p", "95% CI"], r.coefficients.map((c) => [c.term, fmt(c.estimate), fmt(c.standardError), fmt(c.t), fmtP(c.pValue), `${fmt(c.ci95[0])} to ${fmt(c.ci95[1])}`]));
  }
  if (r.variables) {
    for (const v of r.variables) {
      doc.moveDown(0.3);
      if (v.kind === "numeric") {
        table(doc, ["Column", "n", "Mean", "SD", "Median", "Min", "Max", "Q1", "Q3"], [[v.column, v.n, fmt(v.mean, 2), fmt(v.sd, 2), fmt(v.median, 2), fmt(v.min, 2), fmt(v.max, 2), fmt(v.q1, 2), fmt(v.q3, 2)]]);
      } else {
        table(doc, [v.column, "Count", "Percent", "95% CI"], v.frequencies.slice(0, 20).map((f) => [f.value, f.count, `${fmt(f.proportion * 100, 1)}%`, `${fmt(f.ci95[0] * 100, 1)}% to ${fmt(f.ci95[1] * 100, 1)}%`]));
      }
    }
  }
  if (type === "distribution") {
    keyValues(doc, [["Mean", fmt(r.mean)], ["Median", fmt(r.median)], ["SD", fmt(r.sd)], ["IQR", `${fmt(r.q1)} to ${fmt(r.q3)}`], ["Skewness", fmt(r.skewness)]]);
  }
}

// ------------------------------------------------------------------ document

function renderReport({ title, organization, dataset, analysis, generatedBy, generatedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: title, Author: organization.name, Creator: "Hosptic AI" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    drawMark(doc, M, M - 6, 26);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink).text("Hosptic AI", M + 34, M - 2);
    doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(organization.name, M + 34, M + 11);
    doc.y = M + 38;
    doc.font("Helvetica-Bold").fontSize(18).fillColor(C.ink).text(title, M, doc.y, { width: doc.page.width - 2 * M });
    doc.moveDown(0.3);
    para(doc, analysis.question, { color: C.muted, size: 10.5 });

    heading(doc, "Report details");
    keyValues(doc, [
      ["Organisation", `${organization.name} (${organization.email})`],
      ["Dataset", dataset.name],
      ["Source file", dataset.originalFileName],
      ["Rows and columns", `${dataset.rowCount} rows, ${dataset.columnCount} columns`],
      ["Dataset version analysed", analysis.methodology.datasetVersion],
      ["Analysis id", analysis.id],
      ["Generated by", generatedBy],
      ["Generated on", generatedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    ]);

    const m = analysis.methodology;
    heading(doc, "Methodology");
    keyValues(doc, [
      ["Method", m.test],
      ["Variables", Object.entries(m.variables || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")],
      ["Significance level", m.alpha],
      ["Missing data", m.missingData],
      ["How the method was chosen", `${human(m.planSource)}. ${m.planRationale || ""}`.trim()],
      ["Calculation engine", m.engine],
    ]);
    para(doc, m.description, { color: C.muted, size: 9.5 });
    for (const n of m.planNotes || []) para(doc, `Note: ${n}`, { color: C.warn, size: 9 });

    heading(doc, "Statistical findings");
    findings(doc, m.analysisType, analysis.results);

    if (analysis.visualizationData?.charts?.length) {
      ensureSpace(doc, 260); // keep the heading with its first chart
      heading(doc, "Visualisations");
      drawCharts(doc, analysis.visualizationData);
    }

    heading(doc, "Interpretation");
    para(doc, analysis.interpretation);
    doc.moveDown(0.3);
    para(
      doc,
      analysis.interpretationSource === "zai"
        ? "Interpretation written by Z.ai from the computed results above and checked against them. Z.ai did not calculate any numbers."
        : "Interpretation generated by Hosptic from the computed results without external AI.",
      { color: C.muted, size: 8.5 }
    );

    heading(doc, "Assumptions");
    const statusColor = { met: C.good, violated: C.brandInk, caution: C.warn, not_checked: C.muted };
    for (const a of analysis.assumptions) {
      ensureSpace(doc, 30);
      const y = doc.y;
      doc.circle(M + 3, y + 5, 2.5).fill(statusColor[a.status] || C.muted);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text(`${a.name}: ${human(a.status)}`, M + 12, y, { width: doc.page.width - 2 * M - 12 });
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(a.detail, M + 12, doc.y, { width: doc.page.width - 2 * M - 12 });
      doc.moveDown(0.3);
    }
    if (!analysis.assumptions.length) para(doc, "No formal assumptions apply to descriptive summaries.", { color: C.muted, size: 9.5 });

    heading(doc, "Limitations");
    for (const l of analysis.limitations) para(doc, `- ${l}`, { size: 9.5 });

    // Footer on every page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.height - 30;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted);
      doc.text(`Confidential. ${organization.name}. Page ${i + 1} of ${range.count}`, M, bottom, { width: doc.page.width - 2 * M, align: "center", lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { renderReport };
