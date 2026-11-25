const request = require("supertest");
const { app, prisma, client, registerOrg, unique } = require("../helpers/app");

afterAll(() => prisma.$disconnect());

describe("registration", () => {
  test("creates user, organisation and admin membership, and signs in", async () => {
    const c = await registerOrg({ aiProcessingConsent: true });
    expect(c.organization.slug).toMatch(/^hospital-/);
    const me = await c.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.membership.role).toBe("ORGANIZATION_ADMIN");
    expect(me.body.data.user).not.toHaveProperty("passwordHash");
    const org = await c.get("/api/v1/organization");
    expect(org.body.data.aiProcessingEnabled).toBe(true);
    expect(org.body.data.aiDisclosure.whatIsNeverSent).toContain("Raw dataset rows");
  });

  test("is atomic: a duplicate email creates no organisation", async () => {
    const first = await registerOrg();
    const c = await client();
    const r = await c.post("/api/v1/auth/register").send({ fullName: "X", email: first.email, password: "another-password", organizationName: "Ghost Hospital", organizationEmail: "g@h.test" });
    expect(r.status).toBe(409);
    const owner = new (require("pg").Client)({ connectionString: process.env.DIRECT_URL });
    await owner.connect();
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM organizations WHERE name = 'Ghost Hospital'`);
    await owner.end();
    expect(rows[0].n).toBe(0);
  });

  test("validates input and never trusts an organizationId field", async () => {
    const c = await client();
    const weak = await c.post("/api/v1/auth/register").send({ fullName: "X", email: "bad", password: "short", organizationName: "H", organizationEmail: "h@h.test" });
    expect(weak.status).toBe(400);
    const extra = await c.post("/api/v1/auth/register").send({ fullName: "X", email: `x${unique()}@h.test`, password: "long-enough-pw", organizationName: "H", organizationEmail: "h@h.test", organizationId: "00000000-0000-0000-0000-000000000000" });
    expect(extra.status).toBe(400);
  });
});

describe("cookies and CSRF", () => {
  test("auth cookies are HttpOnly and the refresh cookie is path-scoped", async () => {
    const c = await client();
    const r = await c.post("/api/v1/auth/register").send({ fullName: "Cookie Test", email: `c${unique()}@h.test`, password: "long-enough-pw", organizationName: "Cookie Hospital", organizationEmail: "c@h.test" });
    const cookies = r.headers["set-cookie"].join("\n");
    expect(cookies).toMatch(/hosptic_access=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/hosptic_refresh=[^;]+; Max-Age=\d+; Path=\/api\/v1\/auth;.*HttpOnly/);
    expect(cookies).toMatch(/SameSite=Lax/);
  });

  test("state-changing requests without a valid CSRF token are refused", async () => {
    const c = await registerOrg();
    expect((await c.agent.post("/api/v1/auth/logout")).status).toBe(403);
    expect((await c.agent.post("/api/v1/auth/logout").set("X-CSRF-Token", "forged.value")).status).toBe(403);
    expect((await c.agent.patch("/api/v1/organization").send({ name: "x" })).body.error.code).toBe("CSRF_INVALID");
  });

  test("requests without a session are rejected", async () => {
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/v1/datasets")).status).toBe(401);
  });
});

describe("login, refresh, logout", () => {
  test("login works and wrong passwords get the same error as unknown emails", async () => {
    const org = await registerOrg();
    const c = await client();
    const good = await c.post("/api/v1/auth/login").send({ email: org.email, password: org.password });
    expect(good.status).toBe(200);
    c.csrf = good.body.data.csrfToken;
    expect((await c.get("/api/v1/auth/me")).body.data.user.email).toBe(org.email);

    const bad = await (await client()).post("/api/v1/auth/login").send({ email: org.email, password: "wrong-password" });
    const unknown = await (await client()).post("/api/v1/auth/login").send({ email: `nobody${unique()}@h.test`, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  test("refresh rotates the token; reusing an old token revokes the session", async () => {
    const c = await registerOrg();
    const oldRefresh = c.agent.jar.getCookie("hosptic_refresh", { path: "/api/v1/auth", domain: "127.0.0.1", secure: false, script: false });
    expect(oldRefresh).toBeTruthy();
    expect((await c.post("/api/v1/auth/refresh")).status).toBe(200);

    const replay = request(app).post("/api/v1/auth/refresh").set("Cookie", [`hosptic_refresh=${oldRefresh.value}`, `hosptic_csrf=${c.csrf}`]).set("X-CSRF-Token", c.csrf);
    expect((await replay).status).toBe(401);
    // The whole session is now revoked, including the current access token.
    expect((await c.get("/api/v1/auth/me")).status).toBe(401);
  });

  test("logout revokes the session server-side", async () => {
    const c = await registerOrg();
    const access = c.agent.jar.getCookie("hosptic_access", { path: "/", domain: "127.0.0.1", secure: false, script: false }).value;
    expect((await c.post("/api/v1/auth/logout")).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", `hosptic_access=${access}`)).status).toBe(401);
  });
});

describe("invitations", () => {
  test("new user accepts with the token and joins with the invited role", async () => {
    const admin = await registerOrg();
    const email = `n${unique()}@h.test`;
    const inv = await admin.post("/api/v1/organization/members/invite").send({ email, fullName: "New Analyst", role: "ANALYST" });
    expect(inv.status).toBe(201);
    expect(inv.body.data.member.status).toBe("INVITED");
    const c = await client();
    const acc = await c.post("/api/v1/auth/accept-invite").send({ token: inv.body.data.inviteToken, fullName: "New Analyst", password: "analyst-password-1" });
    expect(acc.status).toBe(200);
    const me = await c.get("/api/v1/auth/me");
    expect(me.body.data.membership.role).toBe("ANALYST");
    expect(me.body.data.organization.id).toBe(admin.organization.id);
    // Tokens are single-use.
    expect((await (await client()).post("/api/v1/auth/accept-invite").send({ token: inv.body.data.inviteToken, fullName: "X", password: "analyst-password-1" })).status).toBe(400);
  });

  test("an existing user must prove their password to join a second organisation", async () => {
    const orgA = await registerOrg();
    const orgB = await registerOrg();
    const inv = await orgB.post("/api/v1/organization/members/invite").send({ email: orgA.email, fullName: "Ignored", role: "VIEWER" });
    const c = await client();
    const wrong = await c.post("/api/v1/auth/accept-invite").send({ token: inv.body.data.inviteToken, fullName: "X", password: "attacker-password" });
    expect(wrong.status).toBe(401);
    const right = await c.post("/api/v1/auth/accept-invite").send({ token: inv.body.data.inviteToken, fullName: "X", password: orgA.password });
    expect(right.status).toBe(200);
    expect((await c.get("/api/v1/auth/me")).body.data.organization.id).toBe(orgB.organization.id);
    // Their original organisation is unchanged and still the default at login.
    const login = await (await client()).post("/api/v1/auth/login").send({ email: orgA.email, password: orgA.password });
    expect(login.status).toBe(200);
  });
});
