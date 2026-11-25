import { test } from "node:test";
import assert from "node:assert/strict";
import { messageForStatus, FAILURE } from "../../lib/auth/messages.js";

test("invalid credentials are reported without revealing which field was wrong", () => {
  assert.equal(messageForStatus(401, "login"), "Your email or password is incorrect.");
});

test("rejected sessions prompt a fresh sign-in", () => {
  assert.match(messageForStatus(401, "create"), /session has ended/);
});

test("duplicate accounts point the user to sign in", () => {
  assert.match(messageForStatus(409, "register"), /already exists/);
});

test("server errors use the service-unavailable message", () => {
  assert.equal(messageForStatus(503, "login"), FAILURE.server);
  assert.equal(messageForStatus(500, "register"), FAILURE.server);
});

test("unexpected statuses fall back to a generic message", () => {
  assert.equal(messageForStatus(418, "login"), FAILURE.unknown);
});
