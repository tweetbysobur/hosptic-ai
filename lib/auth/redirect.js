// Only same-site, absolute paths may be used as post-login destinations. Auth pages are
// excluded so a redirect can never loop back into the sign-in flow.

const DEFAULT_DESTINATION = "/app";
const AUTH_PATHS = ["/login", "/register"];

export function safeNextPath(value, fallback = DEFAULT_DESTINATION) {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  let path;
  try {
    path = new URL(value, "https://placeholder.invalid").pathname;
  } catch {
    return fallback;
  }
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return value;
}

export const DEFAULT_AFTER_SIGN_IN = DEFAULT_DESTINATION;
