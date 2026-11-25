const PDFDocument = require("pdfkit");

const INK = "#1f2937";
const MUTED = "#6b7280";
const ACCENT = "#0f766e";

function renderReportPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true, info: { Title: data.title, Author: "Hosptic AI" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const heading = (text) => {
      doc.moveDown(0.8).fillColor(ACCENT).font("Helvetica-Bold").fontSize(13).text(text).moveDown(0.3);
      doc.fillColor(INK).font("Helvetica").fontSize(10);
    };
    const line = (label, value) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value === null || value === undefined ? "n/a" : String(value));
    };
    const bullets = (items) => {
      if (!items || items.length === 0) return doc.text("None recorded.");
      items.forEach((item) => doc.text(`- ${item}`, { indent: 10 }));
    };

    doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(18).text("Hosptic AI", { continued: false });
    doc.fillColor(INK).fontSize(11).font("Helvetica").text(data.organization.name);
    doc.moveDown(0.6).fillColor(INK).font("Helvetica-Bold").fontSize(16).text(data.title);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(`Generated ${data.generatedAt} by ${data.generatedBy}`);
    doc.fillColor(INK).fontSize(10);

    heading("Analysis question");
    doc.text(data.analysis.question);

    heading("Dataset");
    line("Name", data.dataset.name);
    doc.moveDown(0.2);
    line("Rows", data.dataset.rowCount);
    doc.moveDown(0.2);
    line("Columns", data.dataset.columnCount);
    doc.moveDown(0.2);
    line("File type", data.dataset.fileType);

    heading("Methodology");
    const m = data.analysis.methodology || {};
    line("Method", m.name);
    doc.moveDown(0.2);
    line("Significance level (alpha)", m.alpha);
    doc.moveDown(0.2);
    line("Missing data handling", m.missingDataHandling);
    doc.moveDown(0.2);
    line("Rows excluded", m.excludedRows);
    if (m.variables) {
      doc.moveDown(0.2).text("Variables:");
      Object.entries(m.variables).forEach(([role, name]) => doc.text(`  ${role}: ${name}`));
    }

    heading("Statistical findings");
    const r = data.analysis.results || {};
    const scalar = Object.entries(r).filter(([, v]) => v === null || typeof v !== "object" || v.name || v.value !== undefined);
    scalar.forEach(([key, value]) => {
      if (value && typeof value === "object" && value.name !== undefined) {
        line(value.name, value.value);
      } else if (value && typeof value === "object" && value.value !== undefined) {
        line(key, value.value);
      } else {
        line(key, value);
      }
      doc.moveDown(0.15);
    });
    if (r.confidenceInterval) {
      line("95% confidence interval", `${r.confidenceInterval.lower} to ${r.confidenceInterval.upper}`);
      doc.moveDown(0.15);
    }
    if (r.sampleSize) {
      line("Sample size", JSON.stringify(r.sampleSize));
      doc.moveDown(0.15);
    }
    if (r.summary) {
      line("Mean", r.summary.mean);
      doc.moveDown(0.15);
      line("Median", r.summary.median);
      doc.moveDown(0.15);
      line("Standard deviation", r.summary.standardDeviation);
      doc.moveDown(0.15);
    }

    heading("Visualisation");
    drawVisualisation(doc, data.analysis.visualizationData);

    heading("Interpretation");
    doc.text(data.analysis.interpretation || "No AI interpretation is available for this analysis. Review the statistics above.");

    heading("Assumptions");
    bullets(data.analysis.assumptions);

    heading("Limitations");
    bullets(data.analysis.limitations);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.fillColor(MUTED).fontSize(8).text(`Confidential. Page ${i + 1} of ${range.count}.`, 50, 800, { align: "center", width: 495 });
    }
    doc.end();
  });
}

function drawVisualisation(doc, viz) {
  if (!viz) return doc.text("No visualisation data.");
  const bars = [];
  if (viz.type === "histogram" && viz.bins) {
    viz.bins.forEach((b) => bars.push({ label: `${b.start}-${b.end}`, value: b.count }));
  } else if (viz.type === "bar" && viz.categories) {
    viz.categories.slice(0, 15).forEach((c) => bars.push({ label: String(c.label), value: c.count }));
  } else if (viz.type === "groupSummary" && viz.groups) {
    viz.groups.forEach((g) => bars.push({ label: String(g.group), value: g.mean }));
  } else if (viz.type === "scatter") {
    return doc.text(`Scatter plot of ${viz.y} against ${viz.x} with ${viz.points.length} points is available in the application.`);
  } else {
    return doc.text("This visualisation type is available in the application.");
  }
  if (bars.length === 0) return doc.text("No data to display.");

  const max = Math.max(...bars.map((b) => Math.abs(Number(b.value) || 0)), 1);
  const left = 50;
  const labelWidth = 130;
  const barMax = 300;
  bars.forEach((bar) => {
    const y = doc.y;
    const width = (Math.abs(Number(bar.value) || 0) / max) * barMax;
    doc.fontSize(8).fillColor(INK).text(bar.label, left, y, { width: labelWidth, lineBreak: false, ellipsis: true });
    doc.rect(left + labelWidth, y + 1, Math.max(width, 1), 8).fill(ACCENT);
    doc.fillColor(INK).text(String(bar.value), left + labelWidth + barMax + 8, y, { lineBreak: false });
    doc.y = y + 14;
    if (doc.y > 760) doc.addPage();
  });
  doc.fillColor(INK).fontSize(10);
}

module.exports = { renderReportPdf };
