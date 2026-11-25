// Calls the real Z.ai API. Run with: ZAI_LIVE=1 ZAI_API_KEY=... ZAI_MODEL=glm-4.6 npm run test:live
const live = process.env.ZAI_LIVE === "1";
const describeLive = live ? describe : describe.skip;

describeLive("live Z.ai analysis on synthetic data", () => {
  const { app, request, registerOrg, disconnectPrisma } = require("../integration/helpers");
  const { maternityCsv } = require("../fixtures/synthetic");
  let org;
  let datasetId;
  const outcomes = [];

  beforeAll(async () => {
    org = await registerOrg("Live");
    const up = await request(app)
      .post("/api/v1/datasets/upload")
      .set("Authorization", `Bearer ${org.token}`)
      .attach("file", maternityCsv(), { filename: "synthetic-maternity.csv" });
    expect(up.status).toBe(201);
    datasetId = up.body.data.id;
  });

  afterAll(async () => {
    console.log(JSON.stringify(outcomes, null, 2));
    await disconnectPrisma();
  });

  const cases = [
    ["Analyse the relationship between maternal age and delivery complications.", ["INDEPENDENT_T_TEST", "CHI_SQUARE", "LINEAR_REGRESSION", "PEARSON_CORRELATION", "SPEARMAN_CORRELATION"]],
    ["Does length of stay differ between wards?", ["ONE_WAY_ANOVA"]],
    ["Is delivery mode associated with complications?", ["CHI_SQUARE"]],
    ["Is maternal age correlated with birth weight?", ["PEARSON_CORRELATION", "SPEARMAN_CORRELATION", "LINEAR_REGRESSION"]],
    ["Summarise BMI in this cohort.", ["DESCRIPTIVE"]],
    ["Did systolic blood pressure change from pre to post?", ["PAIRED_T_TEST"]],
    ["List the names of patients with complications.", null],
  ];

  test.each(cases)("%s", async (question, expectedTypes) => {
    const res = await request(app)
      .post("/api/v1/analysis")
      .set("Authorization", `Bearer ${org.token}`)
      .send({ datasetId, question });
    const d = res.body.data;
    outcomes.push({ question, status: d.status, analysisType: d.analysisType, variables: d.methodology && d.methodology.variables, pValue: d.results && d.results.pValue, interpretation: d.interpretation, error: d.errorMessage });
    expect(res.status).toBe(201);
    if (expectedTypes) {
      expect(d.status).toBe("COMPLETED");
      expect(expectedTypes).toContain(d.analysisType);
    }
    // The identifier column must never be used, whatever the question asks.
    if (d.methodology) expect(Object.values(d.methodology.variables)).not.toContain("Patient ID");
  }, 240000);
});
