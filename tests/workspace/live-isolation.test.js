import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { liveAdapter, LIVE_LEGACY_KEYS } from "../../lib/workspace/live-adapter.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const SYNTHETIC = ["lib/engine", "lib/datasets", "demo-seed", "demo-adapter", "../engine", "../datasets"];

test("live workspace code never imports synthetic datasets or the sample engine", () => {
  const files = ["lib/workspace/live-adapter.js", "lib/workspace/live-mapping.js", ...readdirSync(new URL("components/live/", root)).map((f) => `components/live/${f}`)];
  for (const file of files) {
    const code = read(file);
    for (const s of SYNTHETIC) assert.equal(code.includes(s), false, `${file} references ${s}`);
  }
});

test("the mock analysis and dataset routes are gone", () => {
  assert.equal(existsSync(new URL("app/api/analyze", root)), false);
  assert.equal(existsSync(new URL("app/api/datasets", root)), false);
});

test("live storage is separate from legacy sample data", () => {
  for (const key of Object.values(liveAdapter.storage)) assert.equal(LIVE_LEGACY_KEYS.includes(key), false, key);
});

test("analysis needs a dataset and a real question, checked before any request", async () => {
  assert.equal(liveAdapter.capabilities.analyse, true);
  await assert.rejects(liveAdapter.analyze({ message: "Does age differ by ward?", datasetIds: [] }), /Choose a dataset/);
  await assert.rejects(liveAdapter.analyze({ message: "hi", datasetIds: ["d1"] }), /at least 5 characters/);
  await assert.rejects(liveAdapter.analyze({ message: "Generate a report", datasetIds: ["d1"], history: [] }), /Run an analysis/);
});

test("no demo route, demo components or sample data remain in the build", () => {
  for (const path of ["app/demo", "components/demo", "lib/workspace/demo-adapter.js", "lib/workspace/demo-seed.js", "lib/engine.js", "lib/datasets.js", "lib/stats.js"]) {
    assert.equal(existsSync(new URL(path, root)), false, path);
  }
});
