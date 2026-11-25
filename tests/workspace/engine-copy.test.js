import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../../lib/engine.js";

test("outlier sentence uses correct grammar and never prints 0.0%", () => {
  const r = analyze({ message: "Show the distribution of length of stay", datasetIds: ["admissions"], context: {}, history: [] });
  const text = r.explanation.join(" ");
  assert.equal(/\b1 admissions\b/.test(text), false, text);
  assert.equal(text.includes("(0.0%)"), false, text);
  assert.match(text, /unusually high or low values|no unusually extreme values/);
});
