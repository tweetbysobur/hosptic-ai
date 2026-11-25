const { prisma, registerOrg, upload, fetchSigned, zai } = require("../helpers/app");

let admin;
let datasetId;
beforeAll(async () => {
  admin = await registerOrg();
  datasetId = (await upload(admin)).body.data.id;
});
afterEach(() => zai.setTransport(async () => { throw new Error("network disabled"); }));
afterAll(() => prisma.$disconnect());

function mockZai(responses) {
  const calls = [];
  zai.setTransport(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(next) } }] }) };
  });
  return calls;
}

const question = "Analyse the relationship between maternal age and delivery complications.";

describe("analysis without external AI (default)", () => {
  test("keyword matching plans the question and results are deterministic", async () => {
    const r = await admin.post("/api/v1/analysis").send({ datasetId, question: "Analyse the relationship between age and complication" });
    expect(r.status).toBe(201);
    const a = r.body.data;
    expect(a).toMatchObject({ status: "COMPLETED", analysisType: "independent_t_test", planSource: "keyword_match", interpretationSource: "deterministic" });
    expect(a.methodology.externalAiUsed).toBe(false);
    expect(a.results.sampleSize).toBe(16);
    expect(a.assumptions.length).toBeGreaterThan(0);
    expect(a.limitations.length).toBeGreaterThan(0);
    expect(a.visualizationData.charts[0].type).toBe("group_means");
  });

  test("unanswerable questions fail clearly and can be retried", async () => {
    const r = await admin.post("/api/v1/analysis").send({ datasetId, question: "how is the hospital doing" });
    expect(r.body.data.status).toBe("FAILED");
    expect(r.body.data.error).toMatch(/No column names/);
    expect(r.body.data.results).toBeNull();
    const retry = await admin.post(`/api/v1/analysis/${r.body.data.id}/retry`);
    expect(retry.body.data.status).toBe("FAILED");
    const done = await admin.post("/api/v1/analysis").send({ datasetId, question: "describe", plan: { analysisType: "descriptive", variables: { columns: ["age"] } } });
    expect((await admin.post(`/api/v1/analysis/${done.body.data.id}/retry`)).status).toBe(400);
  });

  test("explicit plans skip planning, and invalid plans are rejected", async () => {
    const ok = await admin.post("/api/v1/analysis").send({ datasetId, question: "hypertension and complication", plan: { analysisType: "chi_square", variables: { columns: ["hypertension", "complication"] } } });
    expect(ok.body.data).toMatchObject({ status: "COMPLETED", planSource: "user", analysisType: "chi_square" });
    const bad = await admin.post("/api/v1/analysis").send({ datasetId, question: "hypertension and complication", plan: { analysisType: "run_sql", variables: {} } });
    expect(bad.status).toBe(400);
  });

  test("Z.ai is never called while the organisation has AI processing off", async () => {
    const calls = mockZai([{}]);
    await admin.post("/api/v1/analysis").send({ datasetId, question: "age and complication" });
    expect(calls).toHaveLength(0);
  });

  test("list and get", async () => {
    const list = await admin.get(`/api/v1/analysis?datasetId=${datasetId}&status=COMPLETED`);
    expect(list.body.data.items.every((a) => a.status === "COMPLETED")).toBe(true);
    const one = await admin.get(`/api/v1/analysis/${list.body.data.items[0].id}`);
    expect(one.body.data.id).toBe(list.body.data.items[0].id);
  });
});

describe("analysis with Z.ai enabled", () => {
  beforeAll(async () => {
    expect((await admin.patch("/api/v1/organization").send({ aiProcessingEnabled: true })).body.data.aiProcessingEnabled).toBe(true);
  });

  test("Z.ai plans and explains; numbers come from the engine; no identifiers or rows are sent", async () => {
    const calls = mockZai([
      { status: "ok", analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" }, rationale: "Age is numeric and complication has two groups." },
      { interpretation: "Patients with complications were older on average, and the Welch t-test found this difference statistically significant. The groups are small, so the estimate is imprecise.", keyFindings: ["Older patients had more complications in this dataset."], caveats: ["Small groups."] },
    ]);
    const r = await admin.post("/api/v1/analysis").send({ datasetId, question });
    const a = r.body.data;
    expect(a).toMatchObject({ status: "COMPLETED", planSource: "zai", interpretationSource: "zai" });
    expect(a.keyFindings).toHaveLength(1);
    expect(a.methodology.externalAiUsed).toBe(true);
    expect(calls).toHaveLength(2);
    const sent = JSON.stringify(calls);
    expect(sent).not.toContain("patient_name");
    expect(sent).not.toContain("Ada A");
    expect(sent).not.toContain("2026-01-03");
  });

  test("a fabricated number in the AI explanation falls back to the deterministic text", async () => {
    mockZai([
      { status: "ok", analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" }, rationale: "x" },
      { interpretation: "Patients with complications were 19.7 years older, a statistically significant gap.", keyFindings: [], caveats: [] },
    ]);
    const a = (await admin.post("/api/v1/analysis").send({ datasetId, question })).body.data;
    expect(a.interpretationSource).toBe("deterministic_fallback");
    expect(a.methodology.interpretationNote).toMatch(/19.7/);
    expect(a.interpretation).toMatch(/Welch's t-test/);
  });

  test("Z.ai outage falls back to keyword matching and deterministic text", async () => {
    zai.setTransport(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const a = (await admin.post("/api/v1/analysis").send({ datasetId, question: "age and complication" })).body.data;
    expect(a).toMatchObject({ status: "COMPLETED", planSource: "keyword_match", interpretationSource: "deterministic_fallback" });
    expect(a.methodology.planNotes[0]).toMatch(/Z.ai was unavailable/);
  });

  test("an AI clarification request fails the analysis with that question", async () => {
    mockZai([{ status: "needs_clarification", analysisType: null, variables: {}, rationale: "", clarificationQuestion: "Which complication column do you mean?" }]);
    const a = (await admin.post("/api/v1/analysis").send({ datasetId, question: "complications?" })).body.data;
    expect(a.status).toBe("FAILED");
    expect(a.error).toBe("Which complication column do you mean?");
    expect(a.errorDetails).toMatchObject({ needsClarification: true });
  });
});

describe("reports", () => {
  test("generates a PDF for a completed analysis and serves it through a signed link", async () => {
    const an = await admin.post("/api/v1/analysis").send({ datasetId, question: "hypertension and complication", plan: { analysisType: "chi_square", variables: { columns: ["hypertension", "complication"] } } });
    const r = await admin.post("/api/v1/reports").send({ analysisId: an.body.data.id });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: "COMPLETED", title: "Pearson's chi-square test of independence report" });
    const d = await admin.get(`/api/v1/reports/${r.body.data.id}/download`);
    const pdf = await fetchSigned(admin, d.body.data.url);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.slice(0, 5).toString()).toBe("%PDF-");
    expect((await admin.get("/api/v1/reports")).body.data.items.length).toBeGreaterThan(0);
  });

  test("refuses reports for failed analyses", async () => {
    const failed = await admin.post("/api/v1/analysis").send({ datasetId, question: "nothing matches here" });
    expect(failed.body.data.status).toBe("FAILED");
    expect((await admin.post("/api/v1/reports").send({ analysisId: failed.body.data.id })).status).toBe(422);
  });
});
