import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApiClient } from "../../lib/api/client.js";
import { ApiError } from "../../lib/api/errors.js";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (data) => json(200, { success: true, data });
const fail = (status, code, message, details) => json(status, { success: false, error: { code, message, ...(details ? { details } : {}) } });

// Builds a client over a scripted list of responses. Every call is recorded for assertions.
function harness(script, cookies = {}) {
  const calls = [];
  const queue = [...script];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, credentials: init.credentials, body: init.body });
    const next = queue.shift();
    if (typeof next === "function") return next(init);
    if (next instanceof Error) throw next;
    return next;
  };
  const client = createApiClient({ fetchImpl, readCookie: (name) => cookies[name] ?? null, timeoutMs: 5000 });
  return { client, calls };
}

test("requests go to the same-origin /api/v1 prefix with cookies sent", async () => {
  const { client, calls } = harness([ok({ status: "ok" })]);
  await client.send("GET", "/health");
  assert.equal(calls[0].url, "/api/v1/health");
  assert.equal(calls[0].credentials, "same-origin");
});

test("GET requests never send the CSRF header", async () => {
  const { client, calls } = harness([ok({})], { csrf_token: "abc" });
  await client.send("GET", "/auth/me");
  assert.equal(calls[0].headers["X-CSRF-Token"], undefined);
});

test("POST, PATCH and DELETE send the csrf_token cookie as X-CSRF-Token", async () => {
  const { client, calls } = harness([ok({}), ok({}), ok({})], { csrf_token: "tok-123" });
  await client.send("POST", "/auth/logout");
  await client.send("PATCH", "/organization", { body: { name: "New name" } });
  await client.send("DELETE", "/datasets/x");
  for (const call of calls) assert.equal(call.headers["X-CSRF-Token"], "tok-123", call.method);
});

test("a missing csrf cookie sends no header, and the server's CSRF_FAILED is surfaced", async () => {
  const { client, calls } = harness([fail(403, "CSRF_FAILED", "CSRF token missing or invalid")]);
  await assert.rejects(client.auth.logout(), (e) => e instanceof ApiError && e.code === "CSRF_FAILED" && e.status === 403);
  assert.equal(calls[0].headers["X-CSRF-Token"], undefined);
});

test("JSON bodies are serialised with a JSON content type", async () => {
  const { client, calls } = harness([ok({})]);
  await client.auth.login({ email: "a@b.co", password: "x" });
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].body), { email: "a@b.co", password: "x" });
});

test("a success envelope returns its data", async () => {
  const { client } = harness([ok({ user: { id: "u1" } })]);
  assert.deepEqual(await client.auth.me(), { user: { id: "u1" } });
});

test("an error envelope becomes an ApiError with code, message and field details", async () => {
  const details = [{ path: "password", message: "Password must be at least 10 characters" }];
  const { client } = harness([fail(400, "VALIDATION_ERROR", "Request validation failed", details)]);
  await assert.rejects(client.auth.register({}), (e) => {
    assert.equal(e.status, 400);
    assert.equal(e.code, "VALIDATION_ERROR");
    assert.deepEqual(e.details, details);
    return true;
  });
});

test("a non-JSON server error is reported as a server error", async () => {
  const { client } = harness([new Response("<html>bad gateway</html>", { status: 502 })]);
  await assert.rejects(client.auth.me(), (e) => e.status === 502 && e.code === "SERVER_ERROR" && !e.sessionExpired);
});

test("a 200 response that is not an envelope is rejected", async () => {
  const { client } = harness([new Response("oops", { status: 200 })]);
  await assert.rejects(client.auth.me(), (e) => e.code === "INVALID_RESPONSE");
});

test("a connection failure becomes NETWORK_ERROR", async () => {
  const { client } = harness([new TypeError("fetch failed")]);
  await assert.rejects(client.auth.me(), (e) => e.code === "NETWORK_ERROR");
});

test("a timed-out request becomes TIMEOUT", async () => {
  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  const { client } = harness([timeout]);
  await assert.rejects(client.auth.me(), (e) => e.code === "TIMEOUT");
});

test("on 401 the client refreshes once and retries the original request", async () => {
  const { client, calls } = harness([fail(401, "UNAUTHORIZED", "Authentication required"), ok({}), ok({ user: { id: "u1" } })], { csrf_token: "t" });
  const data = await client.auth.me();
  assert.deepEqual(data, { user: { id: "u1" } });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["GET /api/v1/auth/me", "POST /api/v1/auth/refresh", "GET /api/v1/auth/me"]);
});

test("when the refresh fails the error is marked as an expired session", async () => {
  const { client, calls } = harness([fail(401, "UNAUTHORIZED", "Authentication required"), fail(401, "UNAUTHORIZED", "Refresh token missing")]);
  await assert.rejects(client.auth.me(), (e) => e.status === 401 && e.sessionExpired === true);
  assert.equal(calls.length, 2, "no second refresh and no retry");
});

test("a refresh that itself returns 401 is never retried (no loop)", async () => {
  const { client, calls } = harness([fail(401, "UNAUTHORIZED", "x"), fail(401, "UNAUTHORIZED", "x")]);
  await assert.rejects(client.auth.me());
  assert.equal(calls.filter((c) => c.url.endsWith("/auth/refresh")).length, 1);
});

test("a failed login is not refreshed, so wrong passwords show their own message", async () => {
  const { client, calls } = harness([fail(401, "UNAUTHORIZED", "Invalid email or password")]);
  await assert.rejects(client.auth.login({ email: "a@b.co", password: "wrong" }), (e) => e.message === "Invalid email or password" && !e.sessionExpired);
  assert.equal(calls.length, 1);
});

test("parallel 401s share a single refresh", async () => {
  let refreshes = 0;
  const unauthorised = () => fail(401, "UNAUTHORIZED", "x");
  const script = [unauthorised, unauthorised, unauthorised];
  const fetchImpl = async (url) => {
    if (url.endsWith("/auth/refresh")) { refreshes += 1; await new Promise((r) => setTimeout(r, 10)); return ok({}); }
    const next = script.shift();
    if (next) return next();
    return ok({ user: { id: "u1" } });
  };
  const client = createApiClient({ fetchImpl, readCookie: () => null, timeoutMs: 5000 });
  const results = await Promise.all([client.auth.me(), client.auth.me(), client.auth.me()]);
  assert.equal(refreshes, 1);
  assert.equal(results.length, 3);
});

test("the client never writes tokens to browser storage", () => {
  for (const file of ["lib/api/client.js", "lib/api/errors.js", "lib/api/config.js", "lib/api/endpoints.js"]) {
    const code = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.equal(/localStorage|sessionStorage/.test(code), false, file);
  }
});
