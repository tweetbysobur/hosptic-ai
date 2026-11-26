import { test } from "node:test";
import assert from "node:assert/strict";
import { liveAdapter } from "../../lib/workspace/live-adapter.js";
import { analysisToResponse } from "../../lib/workspace/live-mapping.js";

test("a question that is too short is an invalid-question error", async () => {
  await assert.rejects(liveAdapter.analyze({ message: "ward", datasetIds: ["d1"], history: [] }), (e) => e.kind === "invalid");
});

test("no selected dataset is a missing-dataset error", async () => {
  await assert.rejects(liveAdapter.analyze({ message: "Does age differ by ward?", datasetIds: [], history: [] }), (e) => e.kind === "missing");
});

test("a report request before any analysis asks to run one first", async () => {
  await assert.rejects(liveAdapter.analyze({ message: "Generate a report", datasetIds: ["d1"], history: [] }), (e) => e.kind === "invalid" && /Run an analysis/.test(e.message));
});

test("analyses carry no invented follow-ups; the workspace builds them from the dataset", () => {
  const r = analysisToResponse({ id: "a1", question: "q", analysisType: "DESCRIPTIVE", methodology: { variables: { outcome: "age" } }, results: { summary: { mean: 40, median: 39, sampleSize: 10 } } }, { id: "d1", name: "D" });
  assert.deepEqual(r.followUps, []);
  assert.equal(r.analysisId, "a1");
});

test("the adapter exposes report creation and says conversations are not linked on the backend", () => {
  assert.equal(typeof liveAdapter.createReport, "function");
  assert.equal(liveAdapter.capabilities.conversationContext, false);
});
