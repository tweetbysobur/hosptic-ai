import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineFor } from "../../lib/workspace/live-mapping.js";

const anova = (results) => ({
  analysisType: "ONE_WAY_ANOVA",
  methodology: { variables: { outcome: "length_of_stay", group: "ward" }, alpha: 0.05 },
  results: { groups: [{ group: "Surgical", mean: 8 }, { group: "Medical", mean: 6 }, { group: "Maternity", mean: 5 }], ...results },
});

test("headline never prints null when the backend omits pValueDisplay", () => {
  const h = headlineFor(anova({ pValue: 0.00001 }));
  assert.equal(h.includes("null"), false, h);
  assert.match(h, /p < 0\.001$/);
});

test("headline formats a computed p-value to three decimals", () => {
  assert.match(headlineFor(anova({ pValue: 0.0123 })), /p = 0\.012$/);
});

test("headline prefers the backend's display string", () => {
  assert.match(headlineFor(anova({ pValue: 0.00001, pValueDisplay: "<0.001" })), /p < 0\.001$/);
});
