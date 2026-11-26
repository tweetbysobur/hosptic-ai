// Backend API configuration. The browser only ever calls same-origin /api/v1/*; the Next.js
// route handler forwards those calls to the backend named in HOSPTIC_API_URL (server-only).

export const API_PREFIX = "/api/v1";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "X-CSRF-Token";
export const CSRF_METHODS = ["POST", "PATCH", "DELETE"];
export const DEFAULT_TIMEOUT_MS = 30000;
// POST /analysis runs synchronously and can make two AI calls.
export const ANALYSIS_TIMEOUT_MS = 190000;
export const UPLOAD_TIMEOUT_MS = 120000;

export function apiConfigured() {
  return Boolean(process.env.HOSPTIC_API_URL);
}
