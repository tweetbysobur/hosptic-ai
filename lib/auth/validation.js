// Pure validation shared by the forms and the route handlers. Server routes re-run these
// checks, so a client that skips validation still cannot send malformed requests.

import { ORGANISATION_TYPES } from "./contract.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return "Enter your full name.";
  if (name.length < 2) return "Full name must be at least 2 characters.";
  if (name.length > 120) return "Full name must be 120 characters or fewer.";
  return null;
}

export function validateEmail(value) {
  const email = normaliseEmail(value);
  if (!email) return "Enter your work email address.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address, for example name@hospital.org.";
  return null;
}

export function validatePassword(value) {
  const password = String(value ?? "");
  if (!password) return "Enter a password.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Password must include at least one letter and one number.";
  return null;
}

export function validateConfirmPassword(password, confirm) {
  if (!String(confirm ?? "")) return "Confirm your password.";
  if (password !== confirm) return "The passwords do not match.";
  return null;
}

export function validateRegistration(input) {
  const errors = {
    name: validateName(input.name),
    email: validateEmail(input.email),
    password: validatePassword(input.password),
    confirmPassword: validateConfirmPassword(input.password, input.confirmPassword),
  };
  return withoutEmpty(errors);
}

export function validateLogin(input) {
  const errors = {
    email: validateEmail(input.email),
    password: String(input.password ?? "") ? null : "Enter your password.",
  };
  return withoutEmpty(errors);
}

export function validateCreateOrganisation(input) {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const errors = {
    name: !name
      ? "Enter your organisation name."
      : name.length < 2
        ? "Organisation name must be at least 2 characters."
        : name.length > 160
          ? "Organisation name must be 160 characters or fewer."
          : null,
    type: ORGANISATION_TYPES.some((t) => t.value === input.type) ? null : "Choose the type of organisation.",
    country: String(input.country ?? "").trim().length > 80 ? "Country must be 80 characters or fewer." : null,
  };
  return withoutEmpty(errors);
}

export function validateJoinOrganisation(input) {
  const code = String(input.code ?? "").trim();
  const errors = {
    code: !code
      ? "Enter the invitation code from your organisation administrator."
      : code.length < 6 || code.length > 64
        ? "Invitation codes are between 6 and 64 characters."
        : null,
  };
  return withoutEmpty(errors);
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}
