// User-facing messages for failed requests. Mapped from HTTP status and transport failures only,
// so the UI does not depend on the backend's error body format.

export const FAILURE = {
  unconfigured: "The sign-in service is not connected yet. Contact your administrator.",
  network: "We could not reach the sign-in service. Check your connection and try again.",
  timeout: "The sign-in service took too long to respond. Try again.",
  server: "The sign-in service is temporarily unavailable. Try again in a few minutes.",
  unknown: "Something went wrong. Try again.",
};

export function messageForStatus(status, action) {
  if (status === 401 || status === 403) {
    if (action === "login") return "Your email or password is incorrect.";
    return "Your session has ended. Sign in again to continue.";
  }
  if (status === 409 && action === "register") return "An account with this email already exists. Sign in instead.";
  if (status === 404 && action === "join") return "No organisation matches that invitation code.";
  if (status === 422 || status === 400) return "Some details were not accepted. Check the form and try again.";
  if (status === 429) return "Too many attempts. Wait a few minutes before trying again.";
  if (status >= 500) return FAILURE.server;
  return FAILURE.unknown;
}
