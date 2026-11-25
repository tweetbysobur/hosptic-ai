import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { liveAdapter, LIVE_LEGACY_KEYS } from "../../lib/workspace/live-adapter.js";
import { demoAdapter } from "../../lib/workspace/demo-adapter.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const SYNTHETIC = ["lib/engine", "lib/datasets", "demo-seed", "demo-adapter", "../engine", "../datasets"];

test("live workspace code never imports synthetic datasets or the sample engine", () => {
  const files = ["lib/workspace/live-adapter.js", ...readdirSync(new URL("components/live/", root)).map((f) => `components/live/${f}`)];
  for (const file of files) {
    const code = read(file);
    for (const s of SYNTHETIC) assert.equal(code.includes(s), false, `${file} references ${s}`);
  }
});

test("the mock analysis and dataset routes are gone", () => {
  assert.equal(existsSync(new URL("app/api/analyze", root)), false);
  assert.equal(existsSync(new URL("app/api/datasets", root)), false);
});

test("live storage is separate from the demo and from legacy sample data", () => {
  const live = Object.values(liveAdapter.storage);
  for (const key of live) {
    assert.equal(Object.values(demoAdapter.storage).includes(key), false, key);
    assert.equal(LIVE_LEGACY_KEYS.includes(key), false, key);
  }
});

test("the live workspace does not claim it can analyse yet", async () => {
  assert.equal(liveAdapter.capabilities.analyse, false);
  await assert.rejects(liveAdapter.analyze({ message: "x" }), /not connected/);
});

test("the demo still has synthetic datasets and sample analyses", async () => {
  assert.ok((await demoAdapter.listDatasets()).length >= 2);
  assert.ok(demoAdapter.seed().conversations.length === 3);
});
