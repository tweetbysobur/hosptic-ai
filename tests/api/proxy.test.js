import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUpstream, buildUpstreamHeaders, buildDownstreamHeaders } from "../../lib/api/proxy.js";

const BASE = "https://hosptic-api.example.org/";

test("builds the upstream URL under the backend's /api/v1 prefix", () => {
  assert.equal(resolveUpstream(BASE, ["auth", "me"]), "https://hosptic-api.example.org/api/v1/auth/me");
  assert.equal(resolveUpstream(BASE, ["datasets", "3f2a-9b"], "?page=2"), "https://hosptic-api.example.org/api/v1/datasets/3f2a-9b?page=2");
});

test("refuses traversal, encoded and empty segments", () => {
  for (const segments of [["..", "auth"], ["auth", ".."], ["%2e%2e", "x"], ["auth/me"], [""], [], ["auth", "me.json"]]) {
    assert.equal(resolveUpstream(BASE, segments), null, JSON.stringify(segments));
  }
});

test("refuses non-string segments and a missing base URL", () => {
  assert.equal(resolveUpstream(BASE, [42]), null);
  assert.equal(resolveUpstream(undefined, ["auth", "me"]), null);
  assert.equal(resolveUpstream("", ["auth", "me"]), null);
});

test("ignores query strings that do not start with a question mark", () => {
  assert.equal(resolveUpstream(BASE, ["auth", "me"], "evil=1"), "https://hosptic-api.example.org/api/v1/auth/me");
});

test("forwards cookies, CSRF and content headers, and drops everything else", () => {
  const incoming = new Headers({
    cookie: "access_token=a; csrf_token=c",
    "x-csrf-token": "c",
    "content-type": "application/json",
    host: "frontend.example.org",
    origin: "https://frontend.example.org",
    "x-forwarded-for": "203.0.113.9",
    connection: "keep-alive",
  });
  const out = buildUpstreamHeaders(incoming);
  assert.equal(out.get("cookie"), "access_token=a; csrf_token=c");
  assert.equal(out.get("x-csrf-token"), "c");
  assert.equal(out.get("content-type"), "application/json");
  assert.equal(out.get("host"), null);
  assert.equal(out.get("origin"), null);
  assert.equal(out.get("x-forwarded-for"), null);
  assert.equal(out.get("connection"), null);
});

test("forwards every Set-Cookie with its attributes and drops encoding headers", () => {
  const upstream = new Headers();
  upstream.append("Set-Cookie", "access_token=x; Max-Age=900; Path=/api; HttpOnly; SameSite=Lax");
  upstream.append("Set-Cookie", "refresh_token=y; Max-Age=604800; Path=/api/v1/auth; HttpOnly; SameSite=Lax");
  upstream.append("Set-Cookie", "csrf_token=z; Max-Age=604800; Path=/; SameSite=Lax");
  upstream.set("content-type", "application/json");
  upstream.set("content-encoding", "gzip");
  upstream.set("content-length", "123");
  upstream.set("transfer-encoding", "chunked");
  const out = buildDownstreamHeaders(upstream);
  assert.deepEqual(out.getSetCookie(), [
    "access_token=x; Max-Age=900; Path=/api; HttpOnly; SameSite=Lax",
    "refresh_token=y; Max-Age=604800; Path=/api/v1/auth; HttpOnly; SameSite=Lax",
    "csrf_token=z; Max-Age=604800; Path=/; SameSite=Lax",
  ]);
  assert.equal(out.get("content-type"), "application/json");
  assert.equal(out.get("content-encoding"), null);
  assert.equal(out.get("content-length"), null);
  assert.equal(out.get("transfer-encoding"), null);
});
