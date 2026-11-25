const fs = require("fs");
const path = require("path");
const zai = require("../../src/ai/zai.client");
const { columnMetadata, intentPrompt, redactQuestion, interpretationPrompt } = require("../../src/ai/prompt-builder");
const { planWithAi } = require("../../src/ai/intent.service");
const { interpretWithAi, validateInterpretation } = require("../../src/ai/interpretation.service");
const { parseCsv } = require("../../src/analytics/parse");
const { profileTable } = require("../../src/analytics/profile");
const { validatePlan } = require("../../src/analytics/plan");
const { runAnalysis } = require("../../src/analytics/engine");

const table = parseCsv(fs.readFileSync(path.join(__dirname, "..", "fixtures", "maternal.csv")));
const profile = profileTable(table);

function mockZai(content, capture = []) {
  zai.setTransport(async (url, init) => {
    capture.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { total_tokens: 10 } }) };
  });
  return capture;
}

afterEach(() => zai.setTransport(async () => { throw new Error("network disabled"); }));

describe("Z.ai client", () => {
  test("sends the documented request shape", async () => {
    const calls = mockZai({ ok: 1 });
    await zai.chatJson({ system: "s", user: "u" });
    const { url, init, body } = calls[0];
    expect(url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(body).toMatchObject({ model: "glm-5.3", response_format: { type: "json_object" }, thinking: { type: "disabled" }, stream: false });
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  test("parses fenced JSON and rejects non-JSON", () => {
    expect(zai.extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => zai.extractJson("hello")).toThrow(/not valid JSON/);
  });

  test("maps HTTP errors and sensitive refusals", async () => {
    zai.setTransport(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(zai.chatJson({ system: "s", user: "u" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    zai.setTransport(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: "sensitive", message: {} }] }) }));
    await expect(zai.chatJson({ system: "s", user: "u" })).rejects.toMatchObject({ code: "AI_REFUSED" });
  });
});

describe("data minimisation", () => {
  test("metadata excludes identifier columns, dates and raw rows", () => {
    const meta = columnMetadata(profile, table.rows.length);
    const names = meta.columns.map((c) => c.name);
    expect(names).not.toContain("patient_name");
    expect(names).not.toContain("admission_date");
    const text = JSON.stringify(intentPrompt("q", meta));
    expect(text).not.toContain("Ada A");
    expect(text).not.toContain("Bisi B");
  });

  test("redacts emails, phone numbers and long ids from questions", () => {
    expect(redactQuestion("patient jane@x.com on +234 803 123 4567 MRN 12345678")).toBe("patient [email] on [number] MRN [id]");
  });

  test("interpretation payload omits row-level arrays", () => {
    const v = validatePlan({ analysisType: "linear_regression", variables: { predictor: "age", outcome: "parity" } }, profile);
    const out = runAnalysis(table, v.plan);
    const p = JSON.parse(interpretationPrompt({ question: "q", ...out }).user);
    expect(p).not.toHaveProperty("visualizationData");
    const keys = [];
    const walk = (v) => v && typeof v === "object" && Object.entries(v).forEach(([k, x]) => (keys.push(k), walk(x)));
    walk(p.results);
    for (const k of ["residuals", "points", "diffs", "bins"]) expect(keys).not.toContain(k);
  });
});

describe("intent", () => {
  test("accepts a valid AI plan", async () => {
    mockZai({ status: "ok", analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" }, rationale: "Numeric by binary group." });
    const r = await planWithAi("age vs complication", profile, 16);
    expect(r.source).toBe("zai");
    expect(r.plan.analysisType).toBe("independent_t_test");
  });

  test("corrects a method that does not fit the column types", async () => {
    mockZai({ status: "ok", analysisType: "pearson_correlation", variables: { columns: ["age", "complication"] }, rationale: "x" });
    const r = await planWithAi("age vs complication", profile, 16);
    expect(r.source).toBe("zai_corrected");
    expect(r.plan.analysisType).toBe("independent_t_test");
    expect(r.notes[0]).toMatch(/does not fit/);
  });

  test("refuses invented columns and identifier columns", async () => {
    mockZai({ status: "ok", analysisType: "pearson_correlation", variables: { columns: ["bmi", "income"] }, rationale: "x" });
    await expect(planWithAi("q", profile, 16)).rejects.toThrow(/does not exist/);
    mockZai({ status: "ok", analysisType: "frequency", variables: { columns: ["patient_name"] }, rationale: "x" });
    await expect(planWithAi("q", profile, 16)).rejects.toThrow(/identifier/);
  });

  test("passes clarification requests back", async () => {
    mockZai({ status: "needs_clarification", analysisType: null, variables: {}, rationale: "", clarificationQuestion: "Which outcome?" });
    await expect(planWithAi("q", profile, 16)).rejects.toThrow("Which outcome?");
  });
});

describe("interpretation checks", () => {
  const v = validatePlan({ analysisType: "one_way_anova", variables: { outcome: "age", group: "ward" } }, profile);
  const analysis = runAnalysis(table, v.plan);
  const p = analysis.results.pValue.toFixed(3);

  test("accepts text grounded in the results", async () => {
    mockZai({ interpretation: `Mean age did not differ across wards; the result is not statistically significant (p = ${p}).`, keyFindings: [], caveats: [] });
    const r = await interpretWithAi({ question: "q", analysis });
    expect(r.ok).toBe(true);
  });

  test("rejects fabricated numbers", async () => {
    mockZai({ interpretation: "Ward B patients were 47.3 years older on average, which is not statistically significant.", keyFindings: [], caveats: [] });
    const r = await interpretWithAi({ question: "q", analysis });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/47.3/);
  });

  test("rejects significance claims the test did not support, and causal claims", () => {
    expect(validateInterpretation({ interpretation: "Ward choice is statistically significant for age.", keyFindings: [], caveats: [] }, analysis)).toEqual(expect.arrayContaining([expect.stringMatching(/claims significance/)]));
    expect(validateInterpretation({ interpretation: "Ward causes age differences, not statistically significant.", keyFindings: [], caveats: [] }, analysis)).toEqual(expect.arrayContaining([expect.stringMatching(/causal/)]));
  });
});
