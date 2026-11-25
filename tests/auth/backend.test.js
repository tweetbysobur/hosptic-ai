import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HOSPTIC_API_URL = "https://backend.test/api/";
const { callBackend } = await import("../../lib/auth/backend.js");

// Test doubles for the network. They exercise our error handling only; they are not shipped.
const respond = (status, cookies = []) => async () => {
  const headers = new Headers();
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status, headers });
};

beforeEach(() => {
  process.env.HOSPTIC_API_URL = "https://backend.test/api/";
});

test("reports unconfigured without calling the network", async () => {
  delete process.env.HOSPTIC_API_URL;
  let called = false;
  const result = await callBackend({ path: "/auth/login", method: "POST", body: {}, fetchImpl: async () => { called = true; } });
  assert.equal(result.failure, "unconfigured");
  assert.equal(called, false);
});

test("joins the base URL and path without a double slash", async () => {
  let requested;
  await callBackend({ path: "/auth/session", fetchImpl: async (url) => { requested = url; return new Response(null, { status: 200 }); } });
  assert.equal(requested, "https://backend.test/api/auth/session");
});

test("maps a rejected connection to a network failure", async () => {
  const result = await callBackend({ path: "/auth/login", fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  assert.equal(result.failure, "network");
  assert.equal(result.status, 0);
});

test("maps a timeout to a timeout failure", async () => {
  const result = await callBackend({ path: "/auth/login", fetchImpl: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
  assert.equal(result.failure, "timeout");
});

test("returns HTTP status without treating rejection as a network failure", async () => {
  const result = await callBackend({ path: "/auth/login", fetchImpl: respond(401) });
  assert.equal(result.failure, null);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("forwards backend Set-Cookie headers with their attributes", async () => {
  const cookie = "hosptic_session=abc; Path=/; HttpOnly; SameSite=Lax";
  const result = await callBackend({ path: "/auth/login", method: "POST", body: { email: "a@b.co" }, fetchImpl: respond(200, [cookie]) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.setCookies, [cookie]);
});

test("sends the browser cookie to the backend and never echoes it back", async () => {
  let sent;
  const result = await callBackend({ path: "/auth/session", cookieHeader: "hosptic_session=abc", fetchImpl: async (u, init) => { sent = init.headers.Cookie; return new Response(null, { status: 200 }); } });
  assert.equal(sent, "hosptic_session=abc");
  assert.equal(JSON.stringify(result).includes("abc"), false);
});
