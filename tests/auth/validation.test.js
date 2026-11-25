import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRegistration, validateLogin, validateCreateOrganisation, validateJoinOrganisation,
  validatePassword, validateEmail, hasErrors,
} from "../../lib/auth/validation.js";

test("registration reports every invalid field at once", () => {
  const errors = validateRegistration({ name: "", email: "nope", password: "short", confirmPassword: "x" });
  assert.deepEqual(Object.keys(errors).sort(), ["confirmPassword", "email", "name", "password"]);
  assert.equal(hasErrors(errors), true);
});

test("registration accepts a valid submission", () => {
  const errors = validateRegistration({ name: "Amina Bello", email: "amina@hospital.org", password: "secret123", confirmPassword: "secret123" });
  assert.deepEqual(errors, {});
});

test("password must contain a letter and a number and be 8 to 128 characters", () => {
  assert.match(validatePassword("abcdefgh"), /letter and one number/);
  assert.match(validatePassword("12345678"), /letter and one number/);
  assert.match(validatePassword("abc123"), /at least 8/);
  assert.equal(validatePassword("abc12345"), null);
  assert.match(validatePassword("a1" + "x".repeat(130)), /128/);
});

test("confirm password must match exactly", () => {
  const errors = validateRegistration({ name: "Amina Bello", email: "amina@hospital.org", password: "secret123", confirmPassword: "secret124" });
  assert.equal(errors.confirmPassword, "The passwords do not match.");
});

test("email validation trims and rejects malformed addresses", () => {
  assert.equal(validateEmail("  Amina@Hospital.org "), null);
  assert.match(validateEmail("amina@"), /valid email/);
  assert.match(validateEmail(""), /work email/);
});

test("login requires an email and a password", () => {
  assert.deepEqual(validateLogin({ email: "a@b.co", password: "x" }), {});
  assert.equal(validateLogin({ email: "a@b.co", password: "" }).password, "Enter your password.");
});

test("organisation creation requires a name and a known type", () => {
  const errors = validateCreateOrganisation({ name: " ", type: "spaceship", country: "" });
  assert.ok(errors.name);
  assert.ok(errors.type);
  assert.deepEqual(validateCreateOrganisation({ name: "Ogun Clinic", type: "clinic" }), {});
});

test("join requires an invitation code of 6 to 64 characters", () => {
  assert.match(validateJoinOrganisation({ code: "" }).code, /invitation code/);
  assert.match(validateJoinOrganisation({ code: "abc" }).code, /between 6 and 64/);
  assert.deepEqual(validateJoinOrganisation({ code: "ABC123" }), {});
});
