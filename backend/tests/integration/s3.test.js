// Runs the real S3 client code against s3rver, an S3-compatible server that verifies request signatures.
const fs = require("fs");
const os = require("os");
const path = require("path");
const S3rver = require("s3rver");
const { S3Storage, setStorageForTesting } = require("../../src/storage");
const { app, request, registerOrg, uploadCsv, disconnectPrisma } = require("./helpers");

const bucket = "hosptic-test";
let server;
let storage;
let dir;
let port;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3rver-"));
  server = new S3rver({ port: 0, address: "127.0.0.1", silent: true, directory: dir, configureBuckets: [{ name: bucket }] });
  const addr = await server.run();
  port = addr.port;
  storage = new S3Storage({
    STORAGE_BUCKET: bucket,
    STORAGE_ACCESS_KEY: "S3RVER",
    STORAGE_SECRET_KEY: "S3RVER",
    STORAGE_REGION: "us-east-1",
    STORAGE_ENDPOINT: `http://127.0.0.1:${port}`,
  });
  setStorageForTesting(storage);
});

afterAll(async () => {
  setStorageForTesting(null);
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await disconnectPrisma();
});

const ORG = "11111111-1111-4111-8111-111111111111";

describe("S3-compatible storage adapter", () => {
  test("put, get and remove round-trip bytes", async () => {
    const key = `organizations/${ORG}/datasets/d1/original.csv`;
    await storage.put(key, Buffer.from("a,b\n1,2\n"));
    expect((await storage.get(key)).toString()).toBe("a,b\n1,2\n");
    await storage.remove(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  test("keys outside the organisation layout are rejected before any request", async () => {
    await expect(storage.get("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.put(`organizations/${ORG}/../other/x.csv`, Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get("public/file.csv")).rejects.toThrow(/Invalid storage key/);
  });

  test("a signed URL downloads the object and a tampered URL is refused", async () => {
    const key = `organizations/${ORG}/datasets/d2/original.csv`;
    await storage.put(key, Buffer.from("x,y\n3,4\n"));
    const url = await storage.signedUrl(key, 60);
    expect(url).toMatch(/X-Amz-Signature=/);
    expect(url).toMatch(/X-Amz-Expires=60/);
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("x,y\n3,4\n");

    const tampered = url.replace(`datasets/d2/`, `datasets/d3/`);
    expect((await fetch(tampered)).status).toBeGreaterThanOrEqual(400);
  });

  test("an expired signed URL is refused", async () => {
    const key = `organizations/${ORG}/datasets/d5/original.csv`;
    await storage.put(key, Buffer.from("m,n\n7,8\n"));
    const url = await storage.signedUrl(key, 1);
    await new Promise((r) => setTimeout(r, 2500));
    expect((await fetch(url)).status).toBeGreaterThanOrEqual(400);
  });
});

describe("datasets and reports through the API with S3 storage", () => {
  test("upload stores under the organisation prefix and the download endpoint returns a working signed URL", async () => {
    const org = await registerOrg("S3");
    const other = await registerOrg("S3 Other");
    const up = await uploadCsv(org.token);
    expect(up.status).toBe(201);

    const res = await request(app).get(`/api/v1/datasets/${up.body.data.id}/download`).set("Authorization", `Bearer ${org.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.expiresInSeconds).toBe(300);
    expect(res.body.data.url).not.toMatch(/storageKey/);
    const file = await fetch(res.body.data.url);
    expect(file.status).toBe(200);
    expect(await file.text()).toMatch(/^Ward,Days,Outcome/);

    const stored = fs.readdirSync(path.join(dir, bucket), { recursive: true }).map(String);
    expect(stored.some((f) => f.includes(`organizations/${org.organizationId}/datasets/${up.body.data.id}`) || f.includes(org.organizationId))).toBe(true);

    const denied = await request(app).get(`/api/v1/datasets/${up.body.data.id}/download`).set("Authorization", `Bearer ${other.token}`);
    expect(denied.status).toBe(404);
  });

  test("a deleted dataset's file is removed from the bucket", async () => {
    const org = await registerOrg("S3 Delete");
    const up = await uploadCsv(org.token);
    const before = fs.readdirSync(path.join(dir, bucket), { recursive: true }).map(String).filter((f) => f.includes(org.organizationId) && !f.endsWith(".json") && !f.includes("_S3rver"));
    expect(before.length).toBeGreaterThan(0);
    await request(app).delete(`/api/v1/datasets/${up.body.data.id}`).set("Authorization", `Bearer ${org.token}`);
    const after = fs.readdirSync(path.join(dir, bucket), { recursive: true }).map(String).filter((f) => f.includes(org.organizationId) && !f.endsWith(".json") && !f.includes("_S3rver"));
    expect(after.length).toBe(0);
  });
});
