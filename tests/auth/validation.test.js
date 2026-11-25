import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRegistration, validateLogin, validatePassword, validateEmail, validateOrganisationName,
  validateOrganisationEmail, validateFullName, validateConfirmPassword, hasErrors,
} from "../../lib/auth/validation.js";

const valid = {
  fullName: "Amina Bello", email: "amina@hospital.org", password: "secret1234", confirmPassword: "secret1234",
  organizationName: "Ogun General Hospital", organizationEmail: "",
};

test("a complete registration passes", () => {
  assert.deepEqual(validateRegistration(valid), {});
});

test("registration reports every invalid field at once", () => {
  const errors = validateRegistration({ fullName: "", email: "nope", password: "short", confirmPassword: "x", organizationName: "" });
  assert.deepEqual(Object.keys(errors).sort(), ["confirmPassword", "email", "fullName", "organizationName", "password"]);
  assert.equal(hasErrors(errors), true);
});

test("password must be at least 10 characters with a letter and a number", () => {
  assert.match(validatePassword("abcdefghij"), /letter and a number/);
  assert.match(validatePassword("1234567890"), /letter and a number/);
  assert.match(validatePassword("abc12345"), /at least 10/);
  assert.equal(validatePassword("abcdefg123"), null);
  assert.match(validatePassword("a1" + "x".repeat(130)), /128/);
});

test("confirm password must match exactly", () => {
  assert.equal(validateConfirmPassword("secret1234", "secret1235"), "The passwords do not match.");
});

test("full name length is enforced after trimming", () => {
  assert.match(validateFullName(" A "), /at least 2/);
  assert.equal(validateFullName("  Amina   Bello "), null);
});

test("email validation trims, lowercases and rejects malformed addresses", () => {
  assert.equal(validateEmail("  Amina@Hospital.org "), null);
  assert.match(validateEmail("amina@"), /valid email/);
  assert.match(validateEmail(""), /work email/);
});

test("organisation name is required and bounded", () => {
  assert.match(validateOrganisationName(""), /organisation name/);
  assert.match(validateOrganisationName("A"), /at least 2/);
  assert.match(validateOrganisationName("x".repeat(161)), /160/);
});

test("organisation email is optional but must be valid when given", () => {
  assert.equal(validateOrganisationEmail(""), null);
  assert.equal(validateOrganisationEmail("info@hospital.org"), null);
  assert.match(validateOrganisationEmail("info@"), /valid email/);
});

test("login requires an email and a password", () => {
  assert.deepEqual(validateLogin({ email: "a@b.co", password: "x" }), {});
  assert.equal(validateLogin({ email: "a@b.co", password: "" }).password, "Enter your password.");
});
