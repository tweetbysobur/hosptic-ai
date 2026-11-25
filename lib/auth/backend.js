// Server-side client for the Hosptic backend. Runs only inside route handlers and server
// components, so credentials and session cookies never reach browser code or localStorage.

import { backendUrl } from "./contract.js";

const TIMEOUT_MS = 10000;

// Returns { ok, status, setCookies, failure } where failure is null on an HTTP response
// and one of "unconfigured" | "network" | "timeout" when no response was received.
export async function callBackend({ path, method = "GET", body, cookieHeader, fetchImpl = fetch }) {
  const url = backendUrl(path);
  if (!url) return { ok: false, status: 0, setCookies: [], failure: "unconfigured" };

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookieHeader) headers.Cookie = cookieHeader;

  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return {
      ok: response.ok,
      status: response.status,
      setCookies: typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [],
      failure: null,
    };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return { ok: false, status: 0, setCookies: [], failure: timedOut ? "timeout" : "network" };
  }
}

// Forwards backend Set-Cookie headers to the browser, keeping the backend's cookie attributes
// (httpOnly, Secure, SameSite, Path, Max-Age).
export function applySetCookies(response, setCookies) {
  for (const cookie of setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
