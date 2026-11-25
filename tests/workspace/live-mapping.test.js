import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { analysisToResponse, headlineFor, toDatasetSummary, toEvidence, toReportEntry, REPORT_REQUEST } from "../../lib/workspace/live-mapping.js";

const dir = new URL("../../shared/contracts/examples/", import.meta.url);
const example = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")).body.data;
const analysisFiles = readdirSync(dir).filter((f) => /^analysis-(?!list|get)/.test(f));
const dataset = toDatasetSummary(example("datasets-upload.json"));

test("dataset detail maps to the workspace summary and hides personal-data columns", () => {
  const raw = example("datasets-upload.json");
  assert.equal(dataset.id, raw.id);
  assert.equal(dataset.rows, raw.rowCount);
  const sensitive = raw.columns.filter((c) => c.isSensitive).map((c) => c.name);
  assert.ok(sensitive.length > 0);
  for (const name of sensitive) assert.equal(dataset.variables.some((v) => v.key === name), false, name);
  assert.deepEqual(dataset.sensitiveColumns, sensitive);
  assert.ok(dataset.variables.every((v) => ["numeric", "categorical", "binary", "date", "text"].includes(v.type)));
});

test("starter questions only name columns that exist and can be analysed", () => {
  const names = new Set(dataset.variables.map((v) => v.key));
  assert.ok(dataset.starters.length > 0);
  for (const s of dataset.starters) {
    const named = [...names].filter((n) => s.q.includes(n));
    assert.ok(named.length > 0, s.q);
  }
  for (const s of dataset.sensitiveColumns) assert.equal(dataset.starters.some((x) => x.q.includes(s)), false);
});

for (const file of analysisFiles) {
  test(`${file}: maps to a complete response built from computed numbers`, () => {
    const a = example(file);
    const r = analysisToResponse(a, dataset);
    assert.equal(r.type, "analysis");
    assert.equal(r.analysisId, a.id);
    assert.ok(r.headline.length > 10 && !r.headline.includes("undefined") && !r.headline.includes("NaN"), r.headline);
    assert.ok(r.evidence.length >= 1);
    assert.ok(r.technical.results.length >= 2);
    assert.ok(r.technical.limitations.some((l) => l.includes("Z.ai")), "AI disclosure shown");
    if (a.results.pValueDisplay) assert.ok(r.headline.includes(a.results.pValueDisplay.replace(/^</, "< ")), "headline quotes pValueDisplay, never raw p");
    assert.equal(JSON.stringify(r).includes("p = 0)"), false);
    if (a.interpretation) assert.deepEqual(r.explanation, [a.interpretation]);
    else assert.match(r.explanation[0], /not available/);
  });
}

test("a null interpretation still gives a usable response", () => {
  const a = { ...example("analysis-t-test.json"), interpretation: null };
  const r = analysisToResponse(a, dataset);
  assert.match(r.explanation[0], /not available/);
  assert.ok(r.evidence.length > 0);
});

test("every visualization type the contract defines is drawn", () => {
  const charts = {
    histogram: toEvidence(example("analysis-descriptive.json").visualizationData),
    groupSummary: toEvidence(example("analysis-anova.json").visualizationData),
    heatmap: toEvidence(example("analysis-chi-square.json").visualizationData),
    scatter: toEvidence(example("analysis-correlation.json").visualizationData),
    bar: toEvidence({ type: "bar", variable: "Ward", categories: [{ label: "A", count: 3 }, { label: "B", count: 1 }] }),
  };
  assert.equal(charts.histogram[0].chart.type, "histogram");
  assert.equal(charts.groupSummary[0].chart.type, "box");
  assert.equal(charts.heatmap[0].kind, "table");
  assert.equal(charts.scatter[0].chart.type, "scatter");
  assert.equal(charts.bar[0].chart.highlight, "A");
  const yn = toEvidence({ type: "bar", variable: "Diabetes", categories: [{ label: "No", count: 179 }, { label: "Yes", count: 21 }] })[0].chart;
  assert.equal(yn.highlight, "Yes", "the Yes bar is highlighted even when it is smaller");
  assert.equal(charts.bar[0].chart.data[0].share, 75);
  const fit = toEvidence({ type: "scatter", x: "a", y: "b", points: [], fitLine: { slope: 2, intercept: 1, xMin: 0, xMax: 10 } })[0].chart.trend;
  assert.deepEqual(fit, [{ x: 0, y: 1 }, { x: 10, y: 21 }]);
});

test("chi-square table shows counts with column percentages", () => {
  const t = toEvidence(example("analysis-chi-square.json").visualizationData)[0];
  assert.equal(t.rows.length, 2);
  assert.match(t.rows[0].c0, /^29 \(76\.3%\)$/);
});

test("yes/no descriptive results read as a percentage", () => {
  const h = headlineFor({ analysisType: "DESCRIPTIVE", methodology: { variables: { outcome: "Diabetes" } }, results: { frequencies: [{ label: "No", count: 90 }, { label: "Yes", count: 10 }] } });
  assert.equal(h, "10.0% of rows have Diabetes (10 of 100)");
});

test("report entries and report requests", () => {
  const e = toReportEntry(example("reports-create.json"), "Cohort");
  assert.equal(e.pdf, true);
  assert.equal(e.dataset, "Cohort");
  assert.equal(toReportEntry(example("reports-create.json")).dataset, null);
  assert.ok(REPORT_REQUEST.test("Generate a report of this analysis"));
  assert.equal(REPORT_REQUEST.test("What is the diabetes rate?"), false);
});
