// Validation mirrors the backend's rules (shared/contracts/openapi.yaml). The forms and the
// backend both enforce them, so a rejected value is shown before it leaves the browser.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateFullName(value) {
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
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Password must include a letter and a number.";
  return null;
}

export function validateConfirmPassword(password, confirm) {
  if (!String(confirm ?? "")) return "Confirm your password.";
  if (password !== confirm) return "The passwords do not match.";
  return null;
}

export function validateOrganisationName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return "Enter your organisation name.";
  if (name.length < 2) return "Organisation name must be at least 2 characters.";
  if (name.length > 160) return "Organisation name must be 160 characters or fewer.";
  return null;
}

// The organisation email is optional. When it is given it must be a valid address.
export function validateOrganisationEmail(value) {
  if (!String(value ?? "").trim()) return null;
  return validateEmail(value);
}

export function validateRegistration(input) {
  return withoutEmpty({
    fullName: validateFullName(input.fullName),
    email: validateEmail(input.email),
    password: validatePassword(input.password),
    confirmPassword: validateConfirmPassword(input.password, input.confirmPassword),
    organizationName: validateOrganisationName(input.organizationName),
    organizationEmail: validateOrganisationEmail(input.organizationEmail),
  });
}

export function validateLogin(input) {
  return withoutEmpty({
    email: validateEmail(input.email),
    password: String(input.password ?? "") ? null : "Enter your password.",
  });
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}
