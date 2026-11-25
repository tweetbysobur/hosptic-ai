import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoAdapter } from "../../lib/workspace/demo-adapter.js";
import { liveAdapter } from "../../lib/workspace/live-adapter.js";
import { DATASETS } from "../../lib/datasets.js";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const DEMO_FILES = [
  "lib/workspace/demo-adapter.js",
  "lib/workspace/demo-seed.js",
  "components/demo/DemoWorkspace.js",
  "components/demo/DemoBanner.js",
];

test("demo storage keys are namespaced and never shared with the live workspace", () => {
  const demoKeys = Object.values(demoAdapter.storage);
  const liveKeys = Object.values(liveAdapter.storage);
  for (const key of demoKeys) assert.ok(key.startsWith("hosptic.demo."), key);
  for (const key of demoKeys) assert.equal(liveKeys.includes(key), false, key);
});

test("demo code makes no network calls and does not touch authentication", () => {
  for (const file of DEMO_FILES) {
    const code = source(file);
    for (const forbidden of ["fetch(", "XMLHttpRequest", "/api/", "lib/auth", "hosptic.conversations.v1", "hosptic.reports.v1"]) {
      assert.equal(code.includes(forbidden), false, `${file} contains ${forbidden}`);
    }
  }
});

test("live workspace code never reads demo storage", () => {
  assert.equal(source("lib/workspace/live-adapter.js").includes("hosptic.demo"), false);
});

test("demo exposes only the bundled synthetic datasets, each labelled synthetic", async () => {
  const datasets = await demoAdapter.listDatasets();
  assert.deepEqual(datasets.map((d) => d.id).sort(), Object.keys(DATASETS).sort());
  for (const d of datasets) assert.equal(d.synthetic, true, d.id);
});

test("demo refuses to analyse any dataset outside the synthetic set", async () => {
  await assert.rejects(demoAdapter.analyze({ message: "Compare rates", datasetIds: ["tenant-hospital-records"] }), /demonstration dataset/);
  await assert.rejects(demoAdapter.analyze({ message: "Compare rates", datasetIds: [] }), /demonstration dataset/);
});

test("demo refuses an empty question", async () => {
  await assert.rejects(demoAdapter.analyze({ message: "   ", datasetIds: ["maternal"] }), /Enter a question/);
});

test("demo questions are answered by the analysis engine", async () => {
  const r = await demoAdapter.analyze({ message: "Show the monthly trend in maternal complications", datasetIds: ["maternal"] });
  assert.equal(r.type, "analysis");
  assert.ok(r.headline.length > 10);
  assert.ok(r.evidence.length > 0);
  assert.equal(r.dataset.id, "maternal");
});
