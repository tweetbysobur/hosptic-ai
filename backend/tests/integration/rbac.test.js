const { prisma, registerOrg, addMember, upload } = require("../helpers/app");

let admin, researcher, analyst, viewer, datasetId, analysisId;

beforeAll(async () => {
  admin = await registerOrg();
  researcher = await addMember(admin, "RESEARCHER");
  analyst = await addMember(admin, "ANALYST");
  viewer = await addMember(admin, "VIEWER");
  const up = await upload(admin);
  datasetId = up.body.data.id;
  const an = await admin.post("/api/v1/analysis").send({ datasetId, question: "age by complication", plan: { analysisType: "independent_t_test", variables: { outcome: "age", group: "complication" } } });
  analysisId = an.body.data.id;
});
afterAll(() => prisma.$disconnect());

const status = async (p) => (await p).status;

describe("role permissions", () => {
  test("viewer: read only", async () => {
    expect(await status(viewer.get("/api/v1/datasets"))).toBe(200);
    expect(await status(viewer.get(`/api/v1/analysis/${analysisId}`))).toBe(200);
    expect(await status(viewer.get("/api/v1/organization"))).toBe(200);
    expect(await status(upload(viewer))).toBe(403);
    expect(await status(viewer.post("/api/v1/analysis").send({ datasetId, question: "age" }))).toBe(403);
    expect(await status(viewer.post("/api/v1/reports").send({ analysisId }))).toBe(403);
    expect(await status(viewer.delete(`/api/v1/datasets/${datasetId}`))).toBe(403);
    expect(await status(viewer.get(`/api/v1/datasets/${datasetId}/download`))).toBe(403);
    expect(await status(viewer.get("/api/v1/organization/members"))).toBe(403);
  });

  test("analyst: analyses but no uploads, cleaning, reports or admin", async () => {
    expect(await status(analyst.post("/api/v1/analysis").send({ datasetId, question: "describe age", plan: { analysisType: "descriptive", variables: { columns: ["age"] } } }))).toBe(201);
    expect(await status(upload(analyst))).toBe(403);
    expect(await status(analyst.post(`/api/v1/datasets/${datasetId}/clean`).send({ operations: [{ op: "drop_duplicates" }] }))).toBe(403);
    expect(await status(analyst.post("/api/v1/reports").send({ analysisId }))).toBe(403);
    expect(await status(analyst.patch("/api/v1/organization").send({ name: "x" }))).toBe(403);
  });

  test("researcher: uploads, analyses and reports but cannot manage the organisation", async () => {
    const up = await upload(researcher, "admissions.csv");
    expect(up.status).toBe(201);
    expect(await status(researcher.post("/api/v1/reports").send({ analysisId }))).toBe(201);
    expect(await status(researcher.post("/api/v1/organization/members/invite").send({ email: "x@y.test", fullName: "X", role: "VIEWER" }))).toBe(403);
    expect(await status(researcher.patch("/api/v1/organization").send({ aiProcessingEnabled: true }))).toBe(403);
    // Researchers may delete only their own uploads.
    expect(await status(researcher.delete(`/api/v1/datasets/${datasetId}`))).toBe(403);
    expect(await status(researcher.delete(`/api/v1/datasets/${up.body.data.id}`))).toBe(200);
  });

  test("admin manages members, and the last admin cannot be demoted or removed", async () => {
    const members = await admin.get("/api/v1/organization/members");
    const self = members.body.data.find((m) => m.role === "ORGANIZATION_ADMIN");
    expect((await admin.patch(`/api/v1/organization/members/${self.id}`).send({ role: "VIEWER" })).status).toBe(400);
    expect((await admin.delete(`/api/v1/organization/members/${self.id}`)).status).toBe(400);
    expect((await admin.patch(`/api/v1/organization/members/${viewer.membershipId}`).send({ role: "ANALYST" })).body.data.role).toBe("ANALYST");
  });

  test("suspension takes effect on the next request", async () => {
    const temp = await addMember(admin, "VIEWER");
    expect((await temp.get("/api/v1/datasets")).status).toBe(200);
    await admin.patch(`/api/v1/organization/members/${temp.membershipId}`).send({ status: "SUSPENDED" });
    expect((await temp.get("/api/v1/datasets")).status).toBe(401);
  });

  test("role changes apply immediately because the role is read from the membership", async () => {
    const temp = await addMember(admin, "VIEWER");
    expect((await upload(temp)).status).toBe(403);
    await admin.patch(`/api/v1/organization/members/${temp.membershipId}`).send({ role: "RESEARCHER" });
    expect((await upload(temp)).status).toBe(201);
  });
});
