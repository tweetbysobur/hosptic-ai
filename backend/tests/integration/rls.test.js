// These tests check PostgreSQL row-level security directly, without application-level filtering.
const { withTenant } = require("../../src/db/tenant");
const { getPrisma, disconnectPrisma } = require("../../src/db/prisma");
const { registerOrg, uploadCsv, uniq } = require("./helpers");

describe("PostgreSQL row-level security", () => {
  let orgX;
  let orgY;
  let datasetX;

  beforeAll(async () => {
    orgX = await registerOrg("Alpha");
    orgY = await registerOrg("Beta");
    const res = await uploadCsv(orgX.token);
    expect(res.status).toBe(201);
    datasetX = res.body.data.id;
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  test("the runtime role does not own tables and cannot bypass RLS", async () => {
    const rows = await getPrisma().$queryRaw`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  test("without a tenant context, tenant tables return no rows", async () => {
    const count = await getPrisma().dataset.count();
    expect(count).toBe(0);
  });

  test("another organisation cannot see the dataset", async () => {
    const found = await withTenant(orgY.organizationId, (tx) => tx.dataset.findUnique({ where: { id: datasetX } }));
    expect(found).toBeNull();
    const list = await withTenant(orgY.organizationId, (tx) => tx.dataset.findMany());
    expect(list.map((d) => d.id)).not.toContain(datasetX);
  });

  test("the owning organisation sees the dataset", async () => {
    const found = await withTenant(orgX.organizationId, (tx) => tx.dataset.findUnique({ where: { id: datasetX } }));
    expect(found).not.toBeNull();
  });

  test("another organisation cannot update the dataset", async () => {
    const result = await withTenant(orgY.organizationId, (tx) =>
      tx.dataset.updateMany({ where: { id: datasetX }, data: { name: "hijacked" } })
    );
    expect(result.count).toBe(0);
    const unchanged = await withTenant(orgX.organizationId, (tx) => tx.dataset.findUnique({ where: { id: datasetX } }));
    expect(unchanged.name).not.toBe("hijacked");
  });

  test("another organisation cannot delete the dataset", async () => {
    const result = await withTenant(orgY.organizationId, (tx) => tx.dataset.deleteMany({ where: { id: datasetX } }));
    expect(result.count).toBe(0);
  });

  test("an insert that names another organisation is rejected by the policy", async () => {
    await expect(
      withTenant(orgY.organizationId, (tx) =>
        tx.dataset.create({
          data: {
            organizationId: orgX.organizationId,
            uploadedById: orgY.userId,
            name: `injected-${uniq()}`,
            originalFileName: "x.csv",
            storageKey: `organizations/${orgX.organizationId}/datasets/x/original.csv`,
            fileType: "CSV",
            fileSize: 1,
          },
        })
      )
    ).rejects.toThrow(/row-level security/i);
  });

  test("the tenant setting does not leak into the next transaction on the pool", async () => {
    await withTenant(orgX.organizationId, (tx) => tx.dataset.count());
    const afterwards = await getPrisma().dataset.count();
    expect(afterwards).toBe(0);
  });

  test("audit logs cannot be updated or deleted by the application role", async () => {
    const result = await withTenant(orgX.organizationId, async (tx) => {
      const updated = await tx.auditLog.updateMany({ where: { organizationId: orgX.organizationId }, data: { action: "tampered" } });
      const deleted = await tx.auditLog.deleteMany({ where: { organizationId: orgX.organizationId } });
      return { updated: updated.count, deleted: deleted.count };
    });
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);
  });

  test("organisations are visible only to their own tenant context", async () => {
    const seen = await withTenant(orgY.organizationId, (tx) => tx.organization.findMany());
    expect(seen.map((o) => o.id)).toEqual([orgY.organizationId]);
  });
});
