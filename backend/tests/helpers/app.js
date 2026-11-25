const path = require("path");
const request = require("supertest");
const { createApp } = require("../../src/app");
const prisma = require("../../src/config/prisma");
const zai = require("../../src/ai/zai.client");

const app = createApp();
const FIXTURES = path.join(__dirname, "..", "fixtures");
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

// By default no test talks to Z.ai.
zai.setTransport(async () => {
  throw new Error("Network disabled in tests");
});

// A signed-in browser-like client: cookie jar plus CSRF header on writes.
async function client() {
  const agent = request.agent(app);
  const r = await agent.get("/api/v1/auth/csrf");
  const c = { agent, csrf: r.body.data.csrfToken };
  const withCsrf = (method) => (url) => agent[method](url).set("X-CSRF-Token", c.csrf);
  Object.assign(c, { get: (url) => agent.get(url), post: withCsrf("post"), patch: withCsrf("patch"), delete: withCsrf("delete") });
  return c;
}

async function registerOrg(overrides = {}) {
  const c = await client();
  const id = unique();
  const input = {
    fullName: "Admin User",
    email: `admin-${id}@hospital.test`,
    password: "correct-horse-battery",
    organizationName: `Hospital ${id}`,
    organizationEmail: `info-${id}@hospital.test`,
    ...overrides,
  };
  const r = await c.post("/api/v1/auth/register").send(input);
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  c.csrf = r.body.data.csrfToken;
  return { ...c, user: r.body.data.user, organization: r.body.data.organization, password: input.password, email: input.email };
}

// Invites a member with a role and returns a signed-in client for them.
async function addMember(admin, role) {
  const id = unique();
  const email = `${role.toLowerCase()}-${id}@hospital.test`;
  const inv = await admin.post("/api/v1/organization/members/invite").send({ email, fullName: `${role} ${id}`, role });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const c = await client();
  const acc = await c.post("/api/v1/auth/accept-invite").send({ token: inv.body.data.inviteToken, fullName: `${role} ${id}`, password: "member-password-123" });
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
  c.csrf = acc.body.data.csrfToken;
  return { ...c, membershipId: inv.body.data.member.id, email };
}

async function upload(c, file = "maternal.csv", fields = {}) {
  let req = c.post("/api/v1/datasets/upload").attach("file", path.join(FIXTURES, file));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req;
}

// Fetches a signed URL returned by the API through the same agent.
async function fetchSigned(c, url) {
  const u = new URL(url, "http://localhost");
  return c.agent
    .get(u.pathname)
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
}

module.exports = { app, prisma, client, registerOrg, addMember, upload, fetchSigned, FIXTURES, unique, zai };
