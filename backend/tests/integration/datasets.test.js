const fs = require("fs");
const path = require("path");
const { prisma, registerOrg, addMember, upload, fetchSigned, FIXTURES } = require("../helpers/app");

let admin;
beforeAll(async () => {
  admin = await registerOrg();
});
afterAll(() => prisma.$disconnect());

describe("upload", () => {
  test("CSV upload profiles columns and stores the file under the organisation prefix", async () => {
    const r = await upload(admin, "maternal.csv", { name: "Maternal outcomes", description: "Q1" });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ name: "Maternal outcomes", fileType: "csv", rowCount: 16, columnCount: 10, status: "READY" });
    expect(r.body.data).not.toHaveProperty("storageKey");
    const stored = path.join(process.env.STORAGE_LOCAL_DIR, "organizations", admin.organization.id, "datasets", r.body.data.id, "original.csv");
    expect(fs.existsSync(stored)).toBe(true);
    expect(fs.readFileSync(stored)).toEqual(fs.readFileSync(path.join(FIXTURES, "maternal.csv")));
  });

  test("XLSX upload", async () => {
    const r = await upload(admin, "admissions.xlsx");
    expect(r.status).toBe(201);
    expect(r.body.data.columns.map((c) => c.type)).toEqual(["categorical", "numeric", "numeric", "date"]);
  });

  test("rejects spoofed, unsupported and missing files", async () => {
    expect((await upload(admin, "fake.csv")).status).toBe(422);
    expect((await upload(admin, "notes.txt")).status).toBe(422);
    expect((await admin.post("/api/v1/datasets/upload")).status).toBe(400);
  });

  test("rejects files over the size limit", async () => {
    const big = path.join(require("os").tmpdir(), "big.csv");
    fs.writeFileSync(big, "a,b\n" + "1,2\n".repeat(3_000_000));
    const r = await admin.post("/api/v1/datasets/upload").attach("file", big);
    expect(r.status).toBe(413);
    fs.rmSync(big);
  });
});

describe("read endpoints", () => {
  let id;
  beforeAll(async () => {
    id = (await upload(admin)).body.data.id;
  });

  test("list and get", async () => {
    const list = await admin.get("/api/v1/datasets?limit=2");
    expect(list.body.data.items.length).toBeLessThanOrEqual(2);
    const one = await admin.get(`/api/v1/datasets/${id}`);
    expect(one.body.data.columns.find((c) => c.name === "patient_name").isSensitive).toBe(true);
  });

  test("quality report", async () => {
    const q = await admin.get(`/api/v1/datasets/${id}/quality`);
    expect(q.body.data.duplicateRows).toBe(1);
    expect(q.body.data.recommendations.length).toBeGreaterThan(0);
  });

  test("preview masks identifier columns for viewers but not for admins", async () => {
    const viewer = await addMember(admin, "VIEWER");
    const a = await admin.get(`/api/v1/datasets/${id}/preview?limit=2`);
    const v = await viewer.get(`/api/v1/datasets/${id}/preview?limit=2`);
    const col = a.body.data.columns.indexOf("patient_name");
    expect(a.body.data.rows[0][col]).toBe("Ada A");
    expect(v.body.data.rows[0][col]).toBe("***");
    expect(v.body.data.maskedColumns).toEqual(["patient_name"]);
    expect(v.body.data.rows).toHaveLength(2);
  });

  test("signed download returns the original file", async () => {
    const d = await admin.get(`/api/v1/datasets/${id}/download`);
    expect(d.body.data.expiresInSeconds).toBe(300);
    const file = await fetchSigned(admin, d.body.data.url);
    expect(file.status).toBe(200);
    expect(file.body).toEqual(fs.readFileSync(path.join(FIXTURES, "maternal.csv")));
  });

  test("tampered download links are refused", async () => {
    const d = await admin.get(`/api/v1/datasets/${id}/download`);
    const tampered = d.body.data.url.replace(/\.([^.]+)$/, ".AAAA");
    expect((await fetchSigned(admin, tampered)).status).toBe(404);
    expect((await fetchSigned(admin, "/api/v1/files/not-a-token")).status).toBe(404);
    expect((await fetchSigned(admin, "/api/v1/files/%7B%7D.abc")).status).toBe(404);
  });
});

describe("cleaning keeps the original", () => {
  test("clean creates a processed version, records it, and reset restores the original", async () => {
    const id = (await upload(admin)).body.data.id;
    const r = await admin.post(`/api/v1/datasets/${id}/clean`).send({ operations: [{ op: "drop_duplicates" }, { op: "drop_columns", columns: ["patient_name"] }] });
    expect(r.status).toBe(201);
    expect(r.body.data.transformation.rowCountAfter).toBe(15);

    const ds = await admin.get(`/api/v1/datasets/${id}`);
    expect(ds.body.data.hasProcessedVersion).toBe(true);
    expect(ds.body.data.rowCount).toBe(15);
    expect(ds.body.data.transformations).toHaveLength(1);

    const orig = await admin.get(`/api/v1/datasets/${id}/preview?version=original`);
    expect(orig.body.data.totalRows).toBe(16);
    expect(orig.body.data.columns).toContain("patient_name");
    const proc = await admin.get(`/api/v1/datasets/${id}/preview`);
    expect(proc.body.data.version).toBe("processed");
    expect(proc.body.data.columns).not.toContain("patient_name");

    expect((await admin.post(`/api/v1/datasets/${id}/reset`)).status).toBe(200);
    expect((await admin.get(`/api/v1/datasets/${id}`)).body.data.rowCount).toBe(16);

    const audit = await admin.get("/api/v1/organization/audit-logs?limit=50");
    expect(audit.body.data.items.map((a) => a.action)).toEqual(expect.arrayContaining(["dataset.cleaned", "dataset.reset_to_original"]));
  });

  test("invalid operations are rejected before anything is written", async () => {
    const id = (await upload(admin)).body.data.id;
    expect((await admin.post(`/api/v1/datasets/${id}/clean`).send({ operations: [{ op: "rm -rf" }] })).status).toBe(400);
    expect((await admin.post(`/api/v1/datasets/${id}/clean`).send({ operations: [{ op: "coerce_numeric", column: "nope" }] })).status).toBe(422);
    expect((await admin.get(`/api/v1/datasets/${id}`)).body.data.transformations).toHaveLength(0);
  });
});

describe("deletion", () => {
  test("soft-deletes the dataset, removes files, keeps analyses", async () => {
    const id = (await upload(admin)).body.data.id;
    const an = await admin.post("/api/v1/analysis").send({ datasetId: id, question: "describe age", plan: { analysisType: "descriptive", variables: { columns: ["age"] } } });
    expect(an.body.data.status).toBe("COMPLETED");
    const del = await admin.delete(`/api/v1/datasets/${id}`);
    expect(del.body.data).toEqual({ deleted: true, analysesRetained: 1 });
    expect((await admin.get(`/api/v1/datasets/${id}`)).status).toBe(404);
    expect(fs.existsSync(path.join(process.env.STORAGE_LOCAL_DIR, "organizations", admin.organization.id, "datasets", id, "original.csv"))).toBe(false);
    const kept = await admin.get(`/api/v1/analysis/${an.body.data.id}`);
    expect(kept.status).toBe(200);
    expect(kept.body.data.results.variables[0].n).toBe(16);
  });
});
