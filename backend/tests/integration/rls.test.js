// Database-level isolation, tested without the application: connect as the
// restricted role and run raw SQL. These must hold even if an application
// query forgot its organisation filter.
const { Client } = require("pg");
const { prisma, registerOrg, upload } = require("../helpers/app");
const { withTenant } = require("../../src/services/tenant.service");

let A, B, db;
const ids = {};

async function asApp(sql, params = [], ctx = {}) {
  await db.query("BEGIN");
  try {
    if (ctx.org !== undefined || ctx.user !== undefined) {
      await db.query("SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)", [ctx.org || "", ctx.user || ""]);
    }
    const r = await db.query(sql, params);
    await db.query("COMMIT");
    return r;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

const TABLES = ["organizations", "memberships", "datasets", "dataset_columns", "analyses", "analysis_results", "reports", "audit_logs"];

beforeAll(async () => {
  A = await registerOrg();
  B = await registerOrg();
  ids.dsA = (await upload(A)).body.data.id;
  ids.dsB = (await upload(B)).body.data.id;
  const an = await B.post("/api/v1/analysis").send({ datasetId: ids.dsB, question: "describe age", plan: { analysisType: "descriptive", variables: { columns: ["age"] } } });
  ids.anB = an.body.data.id;
  await B.post("/api/v1/reports").send({ analysisId: ids.anB });
  db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
});
afterAll(async () => {
  await db.end();
  await prisma.$disconnect();
});

const orgA = () => A.organization.id;
const orgB = () => B.organization.id;

describe("restricted application role", () => {
  test("is not a superuser, cannot bypass RLS and owns no tables", async () => {
    const r = await db.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user");
    expect(owned.rows[0].n).toBe(0);
  });

  test("RLS is enabled on every hospital-owned table", async () => {
    const r = await db.query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity");
    const enabled = r.rows.map((x) => x.relname);
    for (const t of [...TABLES, "users", "sessions", "dataset_transformations"]) expect(enabled).toContain(t);
  });
});

describe("row visibility", () => {
  test.each(TABLES)("%s: no tenant context returns no rows", async (table) => {
    const r = await asApp(`SELECT count(*)::int AS n FROM ${table}`);
    expect(r.rows[0].n).toBe(0);
  });

  test.each(TABLES)("%s: tenant A sees only A's rows", async (table) => {
    const col = table === "organizations" ? "id" : '"organizationId"';
    const r = await asApp(`SELECT DISTINCT ${col} AS org FROM ${table}`, [], { org: orgA() });
    expect(r.rows.every((x) => x.org === orgA())).toBe(true);
  });

  test("users: A cannot see B's users", async () => {
    const r = await asApp(`SELECT email FROM users`, [], { org: orgA() });
    const emails = r.rows.map((x) => x.email);
    expect(emails).toContain(A.email);
    expect(emails).not.toContain(B.email);
  });

  test("sessions are visible only to their user", async () => {
    const r = await asApp(`SELECT DISTINCT "userId" FROM sessions`, [], { org: orgA(), user: A.user.id });
    expect(r.rows.map((x) => x.userId)).toEqual([A.user.id]);
  });

  test("an explicit WHERE on B's id still returns nothing", async () => {
    const r = await asApp(`SELECT * FROM datasets WHERE id = $1`, [ids.dsB], { org: orgA() });
    expect(r.rowCount).toBe(0);
    const r2 = await asApp(`SELECT * FROM analysis_results WHERE "analysisId" = $1`, [ids.anB], { org: orgA() });
    expect(r2.rowCount).toBe(0);
  });
});

describe("writes", () => {
  test("cannot insert rows for another organisation", async () => {
    await expect(
      asApp(
        `INSERT INTO datasets (id, "organizationId", name, "originalFileName", "storageKey", "fileType", "fileSize", "updatedAt") VALUES (gen_random_uuid(), $1, 'x', 'x.csv', 'k', 'csv', 1, now())`,
        [orgB()],
        { org: orgA() }
      )
    ).rejects.toThrow(/row-level security/);
    await expect(asApp(`INSERT INTO audit_logs (id, "organizationId", action, "resourceType") VALUES (gen_random_uuid(), $1, 'x', 'x')`, [orgB()], { org: orgA() })).rejects.toThrow(/row-level security/);
  });

  test("cannot attach a child row to another organisation's parent (composite foreign keys)", async () => {
    await expect(
      asApp(
        `INSERT INTO analyses (id, "organizationId", "datasetId", question, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'q', now())`,
        [orgA(), ids.dsB],
        { org: orgA() }
      )
    ).rejects.toThrow(/foreign key/);
  });

  test("updates and deletes on B's rows affect nothing", async () => {
    const u = await asApp(`UPDATE datasets SET name = 'pwned' WHERE id = $1`, [ids.dsB], { org: orgA() });
    expect(u.rowCount).toBe(0);
    const d = await asApp(`DELETE FROM datasets WHERE "organizationId" = $1`, [orgB()], { org: orgA() });
    expect(d.rowCount).toBe(0);
    const m = await asApp(`UPDATE memberships SET role = 'VIEWER' WHERE "organizationId" = $1`, [orgB()], { org: orgA() });
    expect(m.rowCount).toBe(0);
  });

  test("cannot move a row into another organisation", async () => {
    await expect(asApp(`UPDATE datasets SET "organizationId" = $1 WHERE id = $2`, [orgB(), ids.dsA], { org: orgA() })).rejects.toThrow(/row-level security|foreign key/);
  });

  test("audit log is append-only", async () => {
    await expect(asApp(`UPDATE audit_logs SET action = 'x'`, [], { org: orgA() })).rejects.toThrow(/permission denied/);
    await expect(asApp(`DELETE FROM audit_logs`, [], { org: orgA() })).rejects.toThrow(/permission denied/);
  });

  test("organisations cannot be deleted by the application role", async () => {
    await expect(asApp(`DELETE FROM organizations`, [], { org: orgA() })).rejects.toThrow(/permission denied/);
  });
});

describe("context does not leak between transactions", () => {
  test("settings are transaction-local on a raw connection", async () => {
    await asApp("SELECT 1", [], { org: orgA() });
    const after = await db.query("SELECT current_setting('app.current_org_id', true) AS v, (SELECT count(*)::int FROM datasets) AS n");
    expect(after.rows[0].v || "").toBe("");
    expect(after.rows[0].n).toBe(0);
  });

  test("Prisma pool: a query after withTenant sees nothing", async () => {
    const inside = await withTenant({ organizationId: orgA() }, (tx) => tx.dataset.count());
    expect(inside).toBeGreaterThan(0);
    expect(await prisma.dataset.count()).toBe(0);
    const [{ v }] = await prisma.$queryRaw`SELECT current_setting('app.current_org_id', true) AS v`;
    expect(v || "").toBe("");
  });

  test("concurrent tenant transactions stay isolated", async () => {
    const runs = Array.from({ length: 12 }, (_, i) => {
      const org = i % 2 ? orgA() : orgB();
      return withTenant({ organizationId: org }, async (tx) => {
        const rows = await tx.dataset.findMany({ select: { organizationId: true } });
        return rows.every((r) => r.organizationId === org);
      });
    });
    expect(await Promise.all(runs)).toEqual(Array(12).fill(true));
  });

  test("withTenant rejects non-UUID context values", async () => {
    await expect(withTenant({ organizationId: "' OR 1=1 --" }, async () => 1)).rejects.toThrow(/Invalid organizationId/);
  });
});
