import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisToResponse, toEvidence, dfText, statsItems, headlineFor } from "../../lib/workspace/live-mapping.js";
import { errorCopy } from "../../lib/workspace/error-copy.js";

// The backend sends scatter points as { x: outcome, y: predictor } (engine.js runCorrelation,
// runRegression). Known pairs: predictor age, outcome length_of_stay.
const pairs = [
  { age: 30, los: 2 },
  { age: 45, los: 5 },
  { age: 70, los: 9 },
];
const backendPoints = pairs.map((p) => ({ x: p.los, y: p.age }));

test("correlation scatter puts the predictor on x and the outcome on y", () => {
  const [e] = toEvidence({ type: "scatter", x: "age", y: "length_of_stay", points: backendPoints });
  assert.equal(e.chart.xLabel, "age");
  assert.equal(e.chart.yLabel, "length_of_stay");
  assert.deepEqual(e.chart.data, pairs.map((p) => ({ x: p.age, y: p.los })));
  assert.equal(e.title, "length_of_stay against age");
});

test("regression scatter and fit line share the predictor-on-x mapping", () => {
  const fitLine = { slope: 0.2, intercept: -4, xMin: 30, xMax: 70 };
  const [e] = toEvidence({ type: "scatter", x: "age", y: "length_of_stay", points: backendPoints, fitLine });
  assert.deepEqual(e.chart.data.map((d) => d.x), [30, 45, 70]);
  assert.deepEqual(e.chart.trend, [{ x: 30, y: 2 }, { x: 70, y: 10 }]);
  const xs = e.chart.data.map((d) => d.x);
  assert.ok(e.chart.trend.every((t) => t.x >= Math.min(...xs) && t.x <= Math.max(...xs)), "fit line spans the plotted x range");
});

test("ANOVA degrees of freedom read as 'between, within'", () => {
  assert.equal(dfText({ between: 2, within: 147 }), "2, 147");
  assert.equal(dfText(148), "148");
  assert.equal(dfText(132.4567), "132.4567");
  const r = analysisToResponse({ id: "a", question: "q", analysisType: "ONE_WAY_ANOVA", methodology: { variables: { outcome: "los", group: "ward" } }, results: { groups: [], degreesOfFreedom: { between: 2, within: 147 }, pValue: 0.2, pValueDisplay: "0.2" } }, null);
  const row = r.technical.results.find((x) => x.label === "Degrees of freedom");
  assert.equal(row.value, "2, 147");
});

const anova = (pValue, pValueDisplay) => ({
  id: "a1",
  question: "Does length_of_stay differ by ward?",
  analysisType: "ONE_WAY_ANOVA",
  methodology: { variables: { outcome: "length_of_stay", group: "ward" }, alpha: 0.05 },
  results: {
    sampleSize: { total: 150 },
    groups: [{ group: "Medical", mean: 6, sampleSize: 50 }, { group: "Surgical", mean: 8, sampleSize: 50 }, { group: "Maternity", mean: 5, sampleSize: 50 }],
    testStatistic: { name: "F", value: 57.17 },
    pValue,
    pValueDisplay,
    effectSize: { name: "eta squared", value: 0.4375 },
  },
  visualizationData: { type: "groupSummary", variable: "length_of_stay", groups: [{ group: "Medical", min: 4, q1: 5, median: 6, q3: 7, max: 8, mean: 6, sampleSize: 50 }] },
});

test("the statistics strip leaves out the p-value the headline already shows", () => {
  const a = anova(0.00001, "<0.0001");
  const headline = headlineFor(a);
  assert.match(headline, /p < 0\.0001$/);
  const labels = statsItems(a, headline).map((s) => s.label);
  assert.ok(!labels.includes("p-value"), labels.join(","));
  assert.ok(labels.includes("F") && labels.includes("Sample size"));
});

test("the strip keeps the p-value when the headline does not show it", () => {
  const a = { analysisType: "DESCRIPTIVE", results: { pValue: 0.2, pValueDisplay: "0.2", sampleSize: 10 } };
  const items = statsItems(a, "Summary of age");
  assert.deepEqual(items.find((s) => s.label === "p-value"), { label: "p-value", value: "0.2" });
});

test("group charts are titled with the real grouping column", () => {
  const r = analysisToResponse(anova(0.00001, "<0.0001"), { id: "d", name: "Admissions 2025" });
  const chart = r.evidence.find((e) => e.kind === "chart");
  assert.equal(chart.title, "length_of_stay by ward");
  assert.ok(!/by group/.test(chart.title));
});

test("coral marks the highest group only when the difference is significant", () => {
  const sig = analysisToResponse(anova(0.00001, "<0.0001"), null).evidence.find((e) => e.kind === "chart");
  assert.equal(sig.chart.highlight, "Surgical");
  const notSig = analysisToResponse(anova(0.4, "0.4"), null).evidence.find((e) => e.kind === "chart");
  assert.equal(notSig.chart.highlight, null);
});

test("dataset mismatch reads as a plain title and keeps the backend reason", () => {
  const c = errorCopy({ kind: "unsupported", message: 'The outcome variable "" does not match a column in the dataset.' }, "Admissions 2025");
  assert.equal(c.title, "Hosptic couldn’t match this question to the columns in Admissions 2025.");
  assert.match(c.reason, /does not match a column/);
});

test("expired session says it once", () => {
  const c = errorCopy({ kind: "session", message: "Your session has ended. Sign in again to continue" });
  assert.equal(c.title, "Your session has ended");
  assert.ok(!c.text.includes("session has ended"), c.text);
});
