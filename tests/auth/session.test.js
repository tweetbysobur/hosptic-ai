import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HOSPTIC_API_URL = "https://backend.test/api";
const { resolveSession } = await import("../../lib/auth/session.js");

const status = (code) => async () => new Response(null, { status: code });

test("no cookie means anonymous, and the backend is not consulted", async () => {
  let called = false;
  const s = await resolveSession({ cookieHeader: "", fetchImpl: async () => { called = true; } });
  assert.equal(s.state, "anonymous");
  assert.equal(called, false);
});

test("a valid session is restored from the cookie", async () => {
  const s = await resolveSession({ cookieHeader: "hosptic_session=abc", fetchImpl: status(200) });
  assert.equal(s.state, "authenticated");
});

test("a cookie the backend rejects is reported as expired", async () => {
  assert.equal((await resolveSession({ cookieHeader: "hosptic_session=old", fetchImpl: status(401) })).state, "expired");
  assert.equal((await resolveSession({ cookieHeader: "hosptic_session=old", fetchImpl: status(403) })).state, "expired");
});

test("an unreachable backend is unavailable, not expired", async () => {
  const s = await resolveSession({ cookieHeader: "hosptic_session=abc", fetchImpl: async () => { throw new TypeError("down"); } });
  assert.equal(s.state, "unavailable");
  assert.equal(s.failure, "network");
});

test("a backend error is unavailable, not authenticated", async () => {
  const s = await resolveSession({ cookieHeader: "hosptic_session=abc", fetchImpl: status(500) });
  assert.equal(s.state, "unavailable");
});
