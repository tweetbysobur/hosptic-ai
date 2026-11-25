// Records real API responses (synthetic data, live Z.ai) into shared/contracts/examples.
// Run: NODE_USE_ENV_PROXY=1 ZAI_API_KEY=... ZAI_MODEL=... node scripts/generate-contract-examples.js
process.env.NODE_ENV = "test";
require("../tests/setup");
const fs = require("fs");
const path = require("path");
const { app, request, registerOrg, registerUser, inviteAs, PASSWORD, disconnectPrisma } = require("../tests/integration/helpers");
const { maternityCsv } = require("../tests/fixtures/synthetic");

const out = path.resolve(__dirname, "../../shared/contracts/examples");
const save = (name, res) => {
  const body = res.body && Object.keys(res.body).length ? res.body : undefined;
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ status: res.status, body }, null, 2) + "\n");
  console.log(name, res.status);
};

(async () => {
  const email = `admin-${Date.now()}@example.test`;
  const reg = await request(app).post("/api/v1/auth/register").send({ fullName: "Ada Okafor", email, password: PASSWORD, organizationName: "Example General Hospital" });
  save("auth-register", reg);
  const token = reg.body.data.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  save("auth-login", await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }));
  save("auth-login-wrong-password", await request(app).post("/api/v1/auth/login").send({ email, password: "Wrong-pass-999" }));
  save("auth-me", await request(app).get("/api/v1/auth/me").set(auth));
  save("error-unauthenticated", await request(app).get("/api/v1/datasets"));
  save("error-validation", await request(app).post("/api/v1/auth/register").send({ fullName: "A", email: "bad", password: "short", organizationName: "" }));

  const up = await request(app).post("/api/v1/datasets/upload").set(auth).field("name", "Synthetic maternity cohort").attach("file", maternityCsv(120), { filename: "synthetic-maternity.csv" });
  save("datasets-upload", up);
  const id = up.body.data.id;
  save("datasets-list", await request(app).get("/api/v1/datasets").set(auth));
  save("datasets-get", await request(app).get(`/api/v1/datasets/${id}`).set(auth));
  save("datasets-preview", await request(app).get(`/api/v1/datasets/${id}/preview?limit=3`).set(auth));
  save("datasets-quality", await request(app).get(`/api/v1/datasets/${id}/quality`).set(auth));
  save("datasets-download-local-storage", await request(app).get(`/api/v1/datasets/${id}/download`).set(auth));
  save("error-bad-file", await request(app).post("/api/v1/datasets/upload").set(auth).attach("file", Buffer.from([0x4d, 0x5a, 0, 1]), { filename: "x.csv" }));

  const ask = async (name, question) => {
    const res = await request(app).post("/api/v1/analysis").set(auth).send({ datasetId: id, question });
    save(name, res);
    return res.body.data.id;
  };
  const tId = await ask("analysis-t-test", "Analyse the relationship between maternal age and delivery complications.");
  await ask("analysis-anova", "Does length of stay differ between wards?");
  await ask("analysis-chi-square", "Is delivery mode associated with complications?");
  await ask("analysis-correlation", "Is maternal age correlated with birth weight?");
  await ask("analysis-descriptive", "Summarise BMI in this cohort.");
  await ask("analysis-paired-t-test", "Did systolic blood pressure change from pre to post?");
  save("analysis-list", await request(app).get("/api/v1/analysis?pageSize=2").set(auth));
  save("analysis-get", await request(app).get(`/api/v1/analysis/${tId}`).set(auth));
  save("error-retry-completed", await request(app).post(`/api/v1/analysis/${tId}/retry`).set(auth));

  const rep = await request(app).post("/api/v1/reports").set(auth).send({ analysisId: tId, title: "Maternal age and complications" });
  save("reports-create", rep);
  save("reports-list", await request(app).get("/api/v1/reports").set(auth));
  save("reports-get", await request(app).get(`/api/v1/reports/${rep.body.data.id}`).set(auth));

  const member = await registerUser("Nurse");
  save("organization-invite", await inviteAs(token, member.email, "VIEWER"));
  save("organization-members", await request(app).get("/api/v1/organization/members").set(auth));
  save("organization-get", await request(app).get("/api/v1/organization").set(auth));

  const other = await registerOrg("Other");
  save("error-cross-organization-dataset", await request(app).get(`/api/v1/datasets/${id}`).set({ Authorization: `Bearer ${other.token}` }));
  const viewerLogin = await request(app).post("/api/v1/auth/login").send({ email: member.email, password: PASSWORD, organizationId: reg.body.data.organization.id });
  save("error-forbidden-role", await request(app).post("/api/v1/analysis").set({ Authorization: `Bearer ${viewerLogin.body.data.accessToken}` }).send({ datasetId: id, question: "Summarise BMI in this cohort." }));
  await disconnectPrisma();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
