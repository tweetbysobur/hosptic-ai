// Two hospitals with their own data. Every attempt by hospital A to reach
// hospital B's resources through the API must fail.
const { prisma, registerOrg, addMember, upload, fetchSigned } = require("../helpers/app");

let A, B;
const b = {};

beforeAll(async () => {
  A = await registerOrg({ organizationName: "Hospital A" });
  B = await registerOrg({ organizationName: "Hospital B" });
  b.member = await addMember(B, "ANALYST");
  b.dataset = (await upload(B)).body.data.id;
  await upload(A, "admissions.csv");
  const an = await B.post("/api/v1/analysis").send({ datasetId: b.dataset, question: "age by complication", plan: { analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" } } });
  b.analysis = an.body.data.id;
  const rep = await B.post("/api/v1/reports").send({ analysisId: b.analysis });
  b.report = rep.body.data.id;
  b.reportUrl = (await B.get(`/api/v1/reports/${b.report}/download`)).body.data.url;
  b.datasetUrl = (await B.get(`/api/v1/datasets/${b.dataset}/download`)).body.data.url;
  b.membershipId = b.member.membershipId;
});
afterAll(() => prisma.$disconnect());

describe("hospital A cannot reach hospital B", () => {
  test("lists contain only A's own records", async () => {
    const ds = await A.get("/api/v1/datasets");
    expect(ds.body.data.items.map((d) => d.id)).not.toContain(b.dataset);
    expect((await A.get("/api/v1/analysis")).body.data.items.map((a) => a.id)).not.toContain(b.analysis);
    expect((await A.get("/api/v1/reports")).body.data.items.map((r) => r.id)).not.toContain(b.report);
    const members = (await A.get("/api/v1/organization/members")).body.data;
    expect(members.map((m) => m.user.email)).not.toContain(B.email);
    expect(members.map((m) => m.id)).not.toContain(b.membershipId);
    const audit = (await A.get("/api/v1/organization/audit-logs?limit=100")).body.data.items;
    expect(audit.map((x) => x.resourceId)).not.toContain(b.dataset);
  });

  test.each([
    ["GET", () => `/api/v1/datasets/${b.dataset}`, null],
    ["GET", () => `/api/v1/datasets/${b.dataset}/preview`, null],
    ["GET", () => `/api/v1/datasets/${b.dataset}/quality`, null],
    ["GET", () => `/api/v1/datasets/${b.dataset}/download`, null],
    ["POST", () => `/api/v1/datasets/${b.dataset}/clean`, { operations: [{ op: "drop_duplicates" }] }],
    ["POST", () => `/api/v1/datasets/${b.dataset}/reset`, null],
    ["DELETE", () => `/api/v1/datasets/${b.dataset}`, null],
    ["GET", () => `/api/v1/analysis/${b.analysis}`, null],
    ["POST", () => `/api/v1/analysis/${b.analysis}/retry`, null],
    ["GET", () => `/api/v1/reports/${b.report}`, null],
    ["GET", () => `/api/v1/reports/${b.report}/download`, null],
    ["PATCH", () => `/api/v1/organization/members/${b.membershipId}`, { role: "VIEWER" }],
    ["DELETE", () => `/api/v1/organization/members/${b.membershipId}`, null],
  ])("%s %p returns 404", async (method, url, body) => {
    const req = A[method.toLowerCase()](url());
    const r = await (body ? req.send(body) : req);
    expect(r.status).toBe(404);
  });

  test("cannot run an analysis on B's dataset", async () => {
    const r = await A.post("/api/v1/analysis").send({ datasetId: b.dataset, question: "age by complication" });
    expect(r.status).toBe(404);
  });

  test("cannot generate a report from B's analysis", async () => {
    expect((await A.post("/api/v1/reports").send({ analysisId: b.analysis })).status).toBe(404);
  });

  test("cannot download B's files even with B's signed links", async () => {
    expect((await fetchSigned(A, b.reportUrl)).status).toBe(404);
    expect((await fetchSigned(A, b.datasetUrl)).status).toBe(404);
    // B itself can.
    expect((await fetchSigned(B, b.reportUrl)).status).toBe(200);
  });

  test("organisation endpoints only ever touch the caller's organisation", async () => {
    const r = await A.patch("/api/v1/organization").send({ name: "Renamed A" });
    expect(r.body.data.id).toBe(A.organization.id);
    expect((await B.get("/api/v1/organization")).body.data.name).toBe("Hospital B");
  });

  test("B's data is untouched after all of the above", async () => {
    expect((await B.get(`/api/v1/datasets/${b.dataset}`)).status).toBe(200);
    expect((await B.get(`/api/v1/analysis/${b.analysis}`)).body.data.status).toBe("COMPLETED");
    const members = (await B.get("/api/v1/organization/members")).body.data;
    expect(members.find((m) => m.id === b.membershipId).role).toBe("ANALYST");
  });
});
