const { app, request, registerOrg, disconnectPrisma } = require("./helpers");
afterAll(disconnectPrisma);
test("an upload over MAX_UPLOAD_MB returns 413 FILE_TOO_LARGE", async () => {
  const org = await registerOrg("Big");
  const big = Buffer.alloc(11 * 1024 * 1024, "a,b\n1,2\n");
  const res = await request(app).post("/api/v1/datasets/upload").set("Authorization", `Bearer ${org.token}`).attach("file", big, { filename: "big.csv" });
  expect(res.status).toBe(413);
  expect(res.body.error.code).toBe("FILE_TOO_LARGE");
});
