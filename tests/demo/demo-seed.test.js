import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoSeed } from "../../lib/workspace/demo-seed.js";

const seed = buildDemoSeed(new Date("2026-11-25T10:00:00Z"));

test("seeds three sample conversations", () => {
  assert.equal(seed.conversations.length, 3);
  for (const c of seed.conversations) {
    assert.ok(c.id && c.title && c.datasetIds.length);
    assert.ok(c.messages.some((m) => m.role === "user"));
  }
});

test("every sample conversation contains a completed analysis with evidence", () => {
  for (const c of seed.conversations) {
    const analysis = c.messages.find((m) => m.role === "assistant" && m.response.type === "analysis");
    assert.ok(analysis, c.title);
    assert.ok(analysis.response.headline.length > 10, c.title);
    assert.ok(analysis.response.explanation.length > 0, c.title);
    assert.ok(analysis.response.evidence.length > 0, c.title);
    assert.ok(Array.isArray(analysis.response.followUps) && analysis.response.followUps.length > 0, c.title);
  }
});

test("sample analyses include interactive charts", () => {
  const charts = seed.conversations.flatMap((c) => c.messages)
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.response.evidence || [])
    .filter((e) => e.kind === "chart");
  assert.ok(charts.length >= 3, `charts=${charts.length}`);
});

test("seeds a sample report linked to its conversation", () => {
  assert.equal(seed.reports.length, 1);
  const [report] = seed.reports;
  assert.ok(report.sections.length >= 1);
  assert.ok(seed.conversations.some((c) => c.id === report.conversationId));
  assert.ok(report.title && report.dataset && report.created);
});

test("seed figures are reproducible", () => {
  const again = buildDemoSeed(new Date("2026-11-25T10:00:00Z"));
  const headlines = (s) => s.conversations.map((c) => c.messages.filter((m) => m.role === "assistant").map((m) => m.response.headline));
  assert.deepEqual(headlines(again), headlines(seed));
});
