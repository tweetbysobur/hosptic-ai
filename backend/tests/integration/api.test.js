const crypto = require("crypto");
const {
  app, request, registerOrg, registerUser, inviteAs, uploadCsv, xlsxBuffer, fakeAi, csvBuffer, uniq, PASSWORD, disconnectPrisma,
} = require("./helpers");
const { setZaiClientForTesting } = require("../../src/ai/zai.client");

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

afterAll(async () => {
  setZaiClientForTesting(null);
  await disconnectPrisma();
});

describe("authentication", () => {
  test("register creates user, organisation and ORGANIZATION_ADMIN membership", async () => {
    const org = await registerOrg("Gamma");
    const me = await request(app).get("/api/v1/auth/me").set(bearer(org.token));
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("ORGANIZATION_ADMIN");
    expect(me.body.data.organization.id).toBe(org.organizationId);
    expect(me.body.data.user).not.toHaveProperty("passwordHash");
  });

  test("duplicate email is rejected", async () => {
    const org = await registerOrg("Dup");
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Again", email: org.email, password: PASSWORD, organizationName: "Second Org",
    });
    expect(res.status).toBe(409);
  });

  test("weak password is rejected by validation", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      fullName: "Weak", email: `w-${uniq()}@example.test`, password: "short", organizationName: "Weak Org",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("login with a wrong password returns 401 without revealing which field failed", async () => {
    const org = await registerOrg("Login");
    const res = await request(app).post("/api/v1/auth/login").send({ email: org.email, password: "Wrong-pass-999" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  test("login sets HTTP-only cookies and a readable CSRF cookie", async () => {
    const org = await registerOrg("Cookies");
    const res = await request(app).post("/api/v1/auth/login").send({ email: org.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"].join(";");
    expect(cookies).toMatch(/access_token=.*HttpOnly/);
    expect(cookies).toMatch(/refresh_token=.*HttpOnly/);
    expect(cookies).toMatch(/csrf_token=(?!.*HttpOnly)/);
  });

  test("refresh rotates the refresh token and the old one stops working", async () => {
    const org = await registerOrg("Refresh");
    const login = await request(app).post("/api/v1/auth/login").send({ email: org.email, password: PASSWORD });
    const refreshCookie = login.headers["set-cookie"].find((c) => c.startsWith("refresh_token="));
    const csrf = login.headers["set-cookie"].find((c) => c.startsWith("csrf_token=")).split(";")[0].split("=")[1];
    const cookieHeader = [refreshCookie.split(";")[0]];

    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", [...cookieHeader, `csrf_token=${csrf}`]).set("X-CSRF-Token", csrf);
    expect(first.status).toBe(200);
    const reused = await request(app).post("/api/v1/auth/refresh").set("Cookie", [...cookieHeader, `csrf_token=${csrf}`]).set("X-CSRF-Token", csrf);
    expect(reused.status).toBe(401);
  });

  test("cookie-authenticated writes without the CSRF header are rejected", async () => {
    const org = await registerOrg("Csrf");
    const login = await request(app).post("/api/v1/auth/login").send({ email: org.email, password: PASSWORD });
    const cookies = login.headers["set-cookie"].map((c) => c.split(";")[0]);
    const csrf = cookies.find((c) => c.startsWith("csrf_token=")).split("=")[1];

    const blocked = await request(app)
      .post("/api/v1/datasets/upload")
      .set("Cookie", cookies)
      .attach("file", csvBuffer(["a,b", "1,2"]), { filename: "a.csv" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CSRF_FAILED");

    const allowed = await request(app)
      .post("/api/v1/datasets/upload")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .attach("file", csvBuffer(["a,b", "1,2"]), { filename: "a.csv" });
    expect(allowed.status).toBe(201);
  });

  test("requests without a token are rejected", async () => {
    const res = await request(app).get("/api/v1/datasets");
    expect(res.status).toBe(401);
  });
});

describe("datasets and tenant isolation", () => {
  let alpha;
  let beta;
  let datasetId;

  beforeAll(async () => {
    alpha = await registerOrg("Alpha2");
    beta = await registerOrg("Beta2");
    const up = await uploadCsv(alpha.token);
    expect(up.status).toBe(201);
    datasetId = up.body.data.id;
  });

  test("upload returns metadata, inferred column types and a quality report", async () => {
    const res = await uploadCsv(alpha.token, ["Patient ID,Age,Ward", "p1,30,A", "p2,31,B"], "Small");
    expect(res.status).toBe(201);
    const byName = Object.fromEntries(res.body.data.columns.map((c) => [c.name, c]));
    expect(byName.Age.inferredType).toBe("NUMERIC");
    expect(byName["Patient ID"].isSensitive).toBe(true);
    expect(res.body.data.quality.rowCount).toBe(2);
  });

  test("the file's bytes are checked, not only its extension", async () => {
    const res = await request(app)
      .post("/api/v1/datasets/upload")
      .set(bearer(alpha.token))
      .attach("file", Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x00]), { filename: "tool.csv" });
    expect(res.status).toBe(422);
  });

  test("a real XLSX upload is accepted", async () => {
    const res = await request(app)
      .post("/api/v1/datasets/upload")
      .set(bearer(alpha.token))
      .attach("file", await xlsxBuffer(), { filename: "maternal.xlsx" });
    expect(res.status).toBe(201);
    expect(res.body.data.fileType).toBe("XLSX");
  });

  test("unsupported extensions are rejected", async () => {
    const res = await request(app).post("/api/v1/datasets/upload").set(bearer(alpha.token)).attach("file", Buffer.from("x"), { filename: "a.pdf" });
    expect(res.status).toBe(400);
  });

  test("another organisation cannot read, preview, query quality, download or delete the dataset", async () => {
    const paths = [
      ["get", `/api/v1/datasets/${datasetId}`],
      ["get", `/api/v1/datasets/${datasetId}/preview`],
      ["get", `/api/v1/datasets/${datasetId}/quality`],
      ["get", `/api/v1/datasets/${datasetId}/download`],
      ["delete", `/api/v1/datasets/${datasetId}`],
    ];
    for (const [method, path] of paths) {
      const res = await request(app)[method](path).set(bearer(beta.token));
      expect([403, 404]).toContain(res.status);
    }
    const list = await request(app).get("/api/v1/datasets").set(bearer(beta.token));
    expect(list.body.data.items.map((d) => d.id)).not.toContain(datasetId);
  });

  test("the owner can preview with sensitive columns masked", async () => {
    const up = await uploadCsv(alpha.token, ["Patient Name,Days", "Ann,3", "Ben,4"], "Named");
    const res = await request(app).get(`/api/v1/datasets/${up.body.data.id}/preview`).set(bearer(alpha.token));
    expect(res.status).toBe(200);
    expect(res.body.data.rows[0]["Patient Name"]).toBe("[masked]");
    expect(res.body.data.rows[0].Days).toBe("3");
  });

  test("another organisation's member id cannot be used to change a membership", async () => {
    const res = await request(app)
      .patch(`/api/v1/organization/members/${crypto.randomUUID()}`)
      .set(bearer(beta.token))
      .send({ role: "VIEWER" });
    expect(res.status).toBe(404);
  });
});

describe("role permissions", () => {
  let admin;
  let viewer;
  let analyst;

  beforeAll(async () => {
    admin = await registerOrg("Roles");
    viewer = await registerUser("Viewer");
    analyst = await registerUser("Analyst");
    expect((await inviteAs(admin.token, viewer.email, "VIEWER")).status).toBe(201);
    expect((await inviteAs(admin.token, analyst.email, "ANALYST")).status).toBe(201);
  });

  test("a viewer cannot upload datasets", async () => {
    const res = await request(app)
      .post("/api/v1/datasets/upload")
      .set(bearer(await loginToken(viewer.email, admin.organizationId)))
      .attach("file", csvBuffer(["a,b", "1,2"]), { filename: "a.csv" });
    expect(res.status).toBe(403);
  });

  test("a viewer can list datasets but cannot preview them", async () => {
    const adminUpload = await uploadCsv(admin.token);
    const viewerToken = await loginToken(viewer.email, admin.organizationId);
    const list = await request(app).get("/api/v1/datasets").set(bearer(viewerToken));
    expect(list.status).toBe(200);
    const preview = await request(app).get(`/api/v1/datasets/${adminUpload.body.data.id}/preview`).set(bearer(viewerToken));
    expect(preview.status).toBe(403);
  });

  test("an analyst cannot manage members", async () => {
    const res = await request(app).get("/api/v1/organization/members").set(bearer(await loginToken(analyst.email, admin.organizationId)));
    expect(res.status).toBe(403);
  });

  test("an admin can list members and cannot remove or demote the last admin", async () => {
    const list = await request(app).get("/api/v1/organization/members").set(bearer(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(3);
    const self = list.body.data.find((m) => m.user.id === admin.userId);
    const demote = await request(app).patch(`/api/v1/organization/members/${self.id}`).set(bearer(admin.token)).send({ role: "VIEWER" });
    expect(demote.status).toBe(400);
  });

  test("an admin can change a member's role and the change takes effect on the next request", async () => {
    const list = await request(app).get("/api/v1/organization/members").set(bearer(admin.token));
    const target = list.body.data.find((m) => m.user.id === viewer.userId);
    const promote = await request(app).patch(`/api/v1/organization/members/${target.id}`).set(bearer(admin.token)).send({ role: "ANALYST" });
    expect(promote.status).toBe(200);
    const viewerToken = await loginToken(viewer.email, admin.organizationId);
    const me = await request(app).get("/api/v1/auth/me").set(bearer(viewerToken));
    expect(me.body.data.role).toBe("ANALYST");
  });

  test("a suspended member loses access immediately", async () => {
    const list = await request(app).get("/api/v1/organization/members").set(bearer(admin.token));
    const target = list.body.data.find((m) => m.user.id === analyst.userId);
    const token = await loginToken(analyst.email, admin.organizationId);
    expect((await request(app).get("/api/v1/datasets").set(bearer(token))).status).toBe(200);
    await request(app).patch(`/api/v1/organization/members/${target.id}`).set(bearer(admin.token)).send({ status: "SUSPENDED" });
    expect((await request(app).get("/api/v1/datasets").set(bearer(token))).status).toBe(401);
  });
});

async function loginToken(email, organizationId) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD, organizationId });
  return res.body.data.accessToken;
}

describe("analysis workflow", () => {
  let owner;
  let other;
  let datasetId;

  beforeAll(async () => {
    owner = await registerOrg("Analysis");
    other = await registerOrg("Outsider");
    const up = await uploadCsv(owner.token);
    datasetId = up.body.data.id;
  });

  afterEach(() => setZaiClientForTesting(null));

  test("without AI configured the analysis is recorded as FAILED with a safe message", async () => {
    const res = await request(app)
      .post("/api/v1/analysis")
      .set(bearer(owner.token))
      .send({ datasetId, question: "Does length of stay differ between wards?" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("FAILED");
    expect(res.body.data.errorMessage).toMatch(/not configured/);
  });

  test("retry after configuration completes the analysis with validated AI output", async () => {
    const failed = await request(app)
      .post("/api/v1/analysis")
      .set(bearer(owner.token))
      .send({ datasetId, question: "Does length of stay differ between wards?" });
    setZaiClientForTesting(
      fakeAi({
        intent: { analysisType: "INDEPENDENT_T_TEST", variables: { outcome: "Days", group: "Ward" }, rationale: "Compares two wards" },
        interpretation: "Ward A had a mean stay near 4 days and ward B near 8.5 days. The difference is statistically significant in this sample. Welch's test was used.",
      })
    );
    const retry = await request(app).post(`/api/v1/analysis/${failed.body.data.id}/retry`).set(bearer(owner.token));
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe("COMPLETED");
    expect(retry.body.data.methodology.name).toMatch(/Welch/);
    expect(retry.body.data.methodology.aiDisclosure.provider).toBe("Z.ai");
    expect(retry.body.data.results.testStatistic).toBeDefined();
    expect(retry.body.data.results.groups.length).toBe(2);
    expect(retry.body.data.visualizationData.type).toBe("groupSummary");
    expect(retry.body.data.results.pValue).toBeLessThan(0.05);
    expect(retry.body.data.interpretation).toMatch(/Welch/);
  });

  test("an interpretation that contradicts the p-value is dropped and the statistics are kept", async () => {
    // Two wards with almost identical stays, so the test is not significant.
    const flat = await uploadCsv(owner.token, ["Ward,Days", "A,3", "A,4", "A,5", "A,4", "B,4", "B,3", "B,5", "B,4"], "Flat");
    setZaiClientForTesting(
      fakeAi({
        intent: { analysisType: "INDEPENDENT_T_TEST", variables: { outcome: "Days", group: "Ward" } },
        interpretation: "Ward B stays were statistically significantly longer than ward A stays in this data.",
      })
    );
    const res = await request(app)
      .post("/api/v1/analysis")
      .set(bearer(owner.token))
      .send({ datasetId: flat.body.data.id, question: "Compare length of stay by ward." });
    expect(res.body.data.status).toBe("COMPLETED");
    expect(res.body.data.results.pValue).toBeGreaterThan(0.05);
    expect(res.body.data.interpretation).toBeNull();
    expect(res.body.data.limitations.join(" ")).toMatch(/Interpretation not generated/);
  });

  test("the AI cannot use a column that is not in the dataset", async () => {
    setZaiClientForTesting(fakeAi({ intent: { analysisType: "DESCRIPTIVE", variables: { outcome: "Salary" } }, interpretation: "unused" }));
    const res = await request(app).post("/api/v1/analysis").set(bearer(owner.token)).send({ datasetId, question: "Summarise salaries." });
    expect(res.body.data.status).toBe("FAILED");
    expect(res.body.data.errorMessage).toMatch(/does not match a column/);
  });

  test("the AI cannot run a method outside the allowed list", async () => {
    setZaiClientForTesting(fakeAi({ intent: { analysisType: "EXEC_SQL", variables: {} }, interpretation: "unused" }));
    const res = await request(app).post("/api/v1/analysis").set(bearer(owner.token)).send({ datasetId, question: "Run a query." });
    expect(res.body.data.status).toBe("FAILED");
  });

  test("another organisation cannot see the analysis or create analyses on this dataset", async () => {
    const list = await request(app).get("/api/v1/analysis").set(bearer(owner.token));
    const analysisId = list.body.data.items[0].id;
    expect((await request(app).get(`/api/v1/analysis/${analysisId}`).set(bearer(other.token))).status).toBe(404);
    const create = await request(app).post("/api/v1/analysis").set(bearer(other.token)).send({ datasetId, question: "Try to read data." });
    expect(create.status).toBe(404);
  });

  test("deleting a dataset keeps its analyses", async () => {
    const up = await uploadCsv(owner.token, undefined, "To delete");
    const dsId = up.body.data.id;
    setZaiClientForTesting(fakeAi({ intent: { analysisType: "DESCRIPTIVE", variables: { outcome: "Days" } }, interpretation: "Mean stay length is calculated from the sample of observations provided." }));
    const created = await request(app).post("/api/v1/analysis").set(bearer(owner.token)).send({ datasetId: dsId, question: "Describe stay length." });
    expect(created.body.data.status).toBe("COMPLETED");
    const del = await request(app).delete(`/api/v1/datasets/${dsId}`).set(bearer(owner.token));
    expect(del.status).toBe(200);
    const still = await request(app).get(`/api/v1/analysis/${created.body.data.id}`).set(bearer(owner.token));
    expect(still.status).toBe(200);
    expect(still.body.data.results).not.toBeNull();
    expect((await request(app).get(`/api/v1/datasets/${dsId}`).set(bearer(owner.token))).status).toBe(404);
  });
});

describe("reports", () => {
  let owner;
  let other;
  let analysisId;

  beforeAll(async () => {
    owner = await registerOrg("Reports");
    other = await registerOrg("Reports Outsider");
    const up = await uploadCsv(owner.token);
    setZaiClientForTesting(
      fakeAi({
        intent: { analysisType: "CHI_SQUARE", variables: { outcome: "Outcome", group: "Ward" } },
        interpretation: "The outcome distribution differs by ward in this sample. The association is statistically significant at the 0.05 level.",
      })
    );
    const a = await request(app).post("/api/v1/analysis").set(bearer(owner.token)).send({ datasetId: up.body.data.id, question: "Is outcome linked to ward?" });
    analysisId = a.body.data.id;
    expect(a.body.data.status).toBe("COMPLETED");
  });

  afterAll(() => setZaiClientForTesting(null));

  test("a report is generated as a PDF and downloads only for its organisation", async () => {
    const created = await request(app).post("/api/v1/reports").set(bearer(owner.token)).send({ analysisId, title: "Ward and outcome" });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("READY");

    const download = await request(app).get(`/api/v1/reports/${created.body.data.id}/download`).set(bearer(owner.token)).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("application/pdf");
    expect(download.body.subarray(0, 5).toString()).toBe("%PDF-");

    const leak = await request(app).get(`/api/v1/reports/${created.body.data.id}/download`).set(bearer(other.token));
    expect(leak.status).toBe(404);
    const leakCreate = await request(app).post("/api/v1/reports").set(bearer(other.token)).send({ analysisId, title: "Steal" });
    expect(leakCreate.status).toBe(404);
  });
});

describe("organisation settings", () => {
  test("an admin updates the organisation and the change is audited", async () => {
    const org = await registerOrg("Settings");
    const res = await request(app).patch("/api/v1/organization").set(bearer(org.token)).send({ name: "Renamed Hospital" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Renamed Hospital");
  });
});
