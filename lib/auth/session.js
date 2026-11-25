// Session resolution. Pure: the caller supplies the cookie header, so this module can be tested
// without a request context. Server components and route handlers obtain it from request.js.
//
// States:
//   anonymous     no session cookie was sent
//   authenticated the backend accepted the session cookie
//   expired       a session cookie was sent but the backend rejected it
//   unavailable   the backend is unconfigured, unreachable or failing

import { callBackend } from "./backend.js";
import { AUTH_ENDPOINTS } from "./contract.js";

export async function resolveSession({ cookieHeader = "", fetchImpl = fetch } = {}) {
  if (!cookieHeader) return { state: "anonymous" };

  const result = await callBackend({ path: AUTH_ENDPOINTS.session, cookieHeader, fetchImpl });
  if (result.failure) return { state: "unavailable", failure: result.failure };
  if (result.ok) return { state: "authenticated" };
  if (result.status === 401 || result.status === 403) return { state: "expired" };
  return { state: "unavailable", failure: "server" };
}
