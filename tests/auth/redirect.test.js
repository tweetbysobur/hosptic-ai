import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, DEFAULT_AFTER_SIGN_IN } from "../../lib/auth/redirect.js";

test("accepts same-site absolute paths", () => {
  assert.equal(safeNextPath("/app"), "/app");
  assert.equal(safeNextPath("/onboarding"), "/onboarding");
  assert.equal(safeNextPath("/app?tab=reports"), "/app?tab=reports");
});

test("rejects external and protocol-relative targets", () => {
  assert.equal(safeNextPath("https://evil.example"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath("//evil.example"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath("/\\evil.example"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath("javascript:alert(1)"), DEFAULT_AFTER_SIGN_IN);
});

test("rejects control characters and non-strings", () => {
  assert.equal(safeNextPath("/app\nSet-Cookie: x"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath(undefined), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath(["/app"]), DEFAULT_AFTER_SIGN_IN);
});

test("never redirects back into the sign-in flow", () => {
  assert.equal(safeNextPath("/login"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath("/login?next=/app"), DEFAULT_AFTER_SIGN_IN);
  assert.equal(safeNextPath("/register"), DEFAULT_AFTER_SIGN_IN);
});
