import { test } from "node:test";
import assert from "node:assert/strict";
import { messageForError, FAILURE } from "../../lib/auth/messages.js";
import { ApiError } from "../../lib/api/errors.js";

test("invalid credentials show the server's message", () => {
  assert.equal(messageForError(new ApiError({ status: 401, code: "UNAUTHORIZED", message: "Invalid email or password" })), "Invalid email or password");
});

test("an expired session asks the user to sign in again", () => {
  assert.match(messageForError(new ApiError({ status: 401, code: "UNAUTHORIZED", sessionExpired: true })), /session has ended/);
});

test("duplicate accounts show the conflict message", () => {
  assert.equal(messageForError(new ApiError({ status: 409, code: "CONFLICT", message: "An account with this email already exists" })), "An account with this email already exists");
});

test("server errors use the service-unavailable message", () => {
  assert.equal(messageForError(new ApiError({ status: 503, code: "SERVER_ERROR" })), FAILURE.server);
  assert.equal(messageForError(new ApiError({ status: 500, code: "SERVER_ERROR" })), FAILURE.server);
});

test("transport failures have their own messages", () => {
  assert.equal(messageForError(new ApiError({ code: "NETWORK_ERROR" })), FAILURE.network);
  assert.equal(messageForError(new ApiError({ code: "TIMEOUT" })), FAILURE.timeout);
  assert.equal(messageForError(new ApiError({ status: 503, code: "NOT_CONNECTED" })), FAILURE.unconfigured);
});

test("CSRF failures and rate limits are explained", () => {
  assert.match(messageForError(new ApiError({ status: 403, code: "CSRF_FAILED" })), /could not be verified/);
  assert.match(messageForError(new ApiError({ status: 429, code: "RATE_LIMITED" })), /Too many attempts/);
});

test("non-API errors fall back to the generic message", () => {
  assert.equal(messageForError(new TypeError("boom")), FAILURE.unknown);
});
