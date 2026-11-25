// Verifies that two organisations' sessions never see each other's data, through the frontend proxy.
// Requires E2E_BASE_URL pointing at a frontend connected to a running backend.
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.E2E_BASE_URL;

// Minimal cookie jar for Node's fetch, which does not keep cookies between calls.
function jar() {
  const cookies = new Map();
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const idx = pair.indexOf("=");
        cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
    },
    csrf: () => cookies.get("csrf_token"),
  };
}

async function call(j, method, path, body) {
  const headers = { Accept: "application/json", Cookie: j.header() };
  if (body) headers["Content-Type"] = "application/json";
  if (method !== "GET" && j.csrf()) headers["X-CSRF-Token"] = j.csrf();
  const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  j.absorb(res);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function registerOrg(label) {
  const j = jar();
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const reg = await call(j, "POST", "/auth/register", {
    fullName: `Admin ${label}`,
    email: `iso.${label}.${stamp}@example.org`,
    password: "Isolation-1pass",
    organizationName: `Isolation ${label} ${stamp}`,
  });
  assert.equal(reg.status, 201, `register ${label}: ${reg.status}`);
  return { j, orgId: reg.body.data.organization.id, orgName: reg.body.data.organization.name };
}

test("each session sees only its own organisation", { skip: !BASE && "set E2E_BASE_URL" }, async () => {
  const a = await registerOrg("a");
  const b = await registerOrg("b");
  assert.notEqual(a.orgId, b.orgId);

  const meA = await call(a.j, "GET", "/auth/me");
  const meB = await call(b.j, "GET", "/auth/me");
  assert.equal(meA.body.data.organization.id, a.orgId);
  assert.equal(meB.body.data.organization.id, b.orgId);

  const orgA = await call(a.j, "GET", "/organization");
  const orgB = await call(b.j, "GET", "/organization");
  assert.equal(orgA.body.data.name, a.orgName);
  assert.equal(orgB.body.data.name, b.orgName);
});

test("a request without a session is refused and reveals nothing", { skip: !BASE && "set E2E_BASE_URL" }, async () => {
  const anon = jar();
  const res = await call(anon, "GET", "/organization");
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
});

test("a cross-site write without the CSRF header is rejected", { skip: !BASE && "set E2E_BASE_URL" }, async () => {
  const a = await registerOrg("csrf");
  const headers = { "Content-Type": "application/json", Cookie: a.j.header() };
  const res = await fetch(`${BASE}/api/v1/auth/logout`, { method: "POST", headers });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, "CSRF_FAILED");
});
