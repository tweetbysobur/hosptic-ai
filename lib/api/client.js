// Browser API client. Cookies are HTTP-only and are never read or stored by this code. The one
// exception is csrf_token, which the contract defines as readable: it is copied into the
// X-CSRF-Token header on POST, PATCH and DELETE. No token is written to browser storage.

import { API_PREFIX, CSRF_COOKIE, CSRF_HEADER, CSRF_METHODS, DEFAULT_TIMEOUT_MS, ANALYSIS_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "./config.js";
import { ENDPOINTS, pathFor } from "./endpoints.js";
import { ApiError, fromEnvelope, networkError, timeoutError } from "./errors.js";

// Requests that must never trigger a refresh attempt, to avoid loops.
const NO_REFRESH = [ENDPOINTS.login.path, ENDPOINTS.register.path, ENDPOINTS.refresh.path, ENDPOINTS.logout.path];

export function readBrowserCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function createApiClient({ fetchImpl, readCookie = readBrowserCookie, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl ?? ((url, init) => fetch(url, init));
  let refreshInFlight = null;

  async function send(method, path, { body, form, retry = true, timeout = timeoutMs, raw = false } = {}) {
    const headers = { Accept: raw ? "*/*" : "application/json" };
    if (body !== undefined && !form) headers["Content-Type"] = "application/json";
    if (CSRF_METHODS.includes(method)) {
      const token = readCookie(CSRF_COOKIE);
      if (token) headers[CSRF_HEADER] = token;
    }

    let response;
    try {
      response = await doFetch(`${API_PREFIX}${path}`, {
        method,
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(timeout),
      });
    } catch (cause) {
      throw cause?.name === "TimeoutError" || cause?.name === "AbortError" ? timeoutError() : networkError();
    }

    // Binary downloads (report PDFs): return the body as a Blob with its file name.
    if (raw && response.ok) {
      const disposition = response.headers.get("content-disposition") || "";
      const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] || null;
      return { blob: await response.blob(), fileName: name };
    }

    const payload = await response.json().catch(() => null);
    if (response.ok && payload && payload.success === true) return payload.data;
    if (response.ok) throw new ApiError({ status: response.status, code: "INVALID_RESPONSE", message: "The server sent an unexpected response." });

    if (response.status === 401 && retry && !NO_REFRESH.includes(path)) {
      if (await refresh()) return send(method, path, { body, form, retry: false, timeout, raw });
      throw new ApiError({ ...fromEnvelope(401, payload), sessionExpired: true });
    }
    throw fromEnvelope(response.status, payload);
  }

  // One refresh at a time. Parallel 401s share the same refresh instead of rotating the token repeatedly.
  function refresh() {
    if (!refreshInFlight) {
      const pending = send("POST", ENDPOINTS.refresh.path, { retry: false })
        .then(() => true, () => false)
        .finally(() => { if (refreshInFlight === pending) refreshInFlight = null; });
      refreshInFlight = pending;
    }
    return refreshInFlight;
  }

  return {
    send,
    auth: {
      register: (body) => send(ENDPOINTS.register.method, ENDPOINTS.register.path, { body }),
      login: (body) => send(ENDPOINTS.login.method, ENDPOINTS.login.path, { body }),
      logout: () => send(ENDPOINTS.logout.method, ENDPOINTS.logout.path),
      me: () => send(ENDPOINTS.me.method, ENDPOINTS.me.path),
    },
    organization: {
      get: () => send(ENDPOINTS.organization.method, ENDPOINTS.organization.path),
    },
    datasets: {
      list: () => send(ENDPOINTS.datasetList.method, `${ENDPOINTS.datasetList.path}?page=1&pageSize=100`),
      get: (id) => send(ENDPOINTS.datasetGet.method, pathFor(ENDPOINTS.datasetGet, id)),
      remove: (id) => send(ENDPOINTS.datasetDelete.method, pathFor(ENDPOINTS.datasetDelete, id)),
      // Multipart upload. The browser sets the multipart boundary, so no Content-Type is added here.
      upload: (form) => send(ENDPOINTS.datasetUpload.method, ENDPOINTS.datasetUpload.path, { form, timeout: UPLOAD_TIMEOUT_MS }),
    },
    analysis: {
      create: ({ datasetId, question }) =>
        send(ENDPOINTS.analysisCreate.method, ENDPOINTS.analysisCreate.path, { body: { datasetId, question }, timeout: ANALYSIS_TIMEOUT_MS }),
      get: (id) => send(ENDPOINTS.analysisGet.method, pathFor(ENDPOINTS.analysisGet, id)),
      retry: (id) => send(ENDPOINTS.analysisRetry.method, pathFor(ENDPOINTS.analysisRetry, id), { timeout: ANALYSIS_TIMEOUT_MS }),
    },
    reports: {
      create: ({ analysisId, title }) => send(ENDPOINTS.reportCreate.method, ENDPOINTS.reportCreate.path, { body: { analysisId, ...(title ? { title } : {}) } }),
      list: () => send(ENDPOINTS.reportList.method, `${ENDPOINTS.reportList.path}?page=1&pageSize=100`),
      download: (id) => send(ENDPOINTS.reportDownload.method, pathFor(ENDPOINTS.reportDownload, id), { raw: true }),
    },
  };
}

export const apiClient = createApiClient();
