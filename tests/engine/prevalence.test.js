import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, plan } from "../../lib/engine.js";
import { loadRows } from "../../lib/datasets.js";

const questions = ["diabetes percentage is what", "what is the percentage of diabetes", "how many patients have diabetes", "diabetes rate"];

for (const q of questions) {
  test(`a single yes/no variable is answered with its prevalence: "${q}"`, () => {
    assert.equal(plan(q, ["maternal"]).intent, "distribution");
    const r = analyze({ message: q, datasetIds: ["maternal"] });
    assert.equal(r.type, "analysis");
    assert.match(r.headline, /^\d+\.\d% of deliveries had diabetes \(\d+ of [\d,]+\)$/);
  });
}

test("prevalence matches a direct count and has a Wilson interval around it", () => {
  const rows = loadRows("maternal").filter((r) => r.diabetes !== null && r.diabetes !== undefined);
  const k = rows.filter((r) => r.diabetes === true).length;
  const r = analyze({ message: "diabetes percentage", datasetIds: ["maternal"] });
  assert.ok(r.headline.includes(`(${k} of ${rows.length.toLocaleString()})`), r.headline);
  const ci = r.evidence.find((e) => e.kind === "stats").items.find((i) => i.label === "95% CI").value;
  const [lo, hi] = ci.split(" – ").map((s) => parseFloat(s));
  const p = (k / rows.length) * 100;
  assert.ok(lo < p && p < hi, `${lo} < ${p} < ${hi}`);
});

test("a yes/no variable with a grouping still compares groups", () => {
  assert.equal(plan("diabetes rate by ward", ["maternal"]).intent, "compare");
});
