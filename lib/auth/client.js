// Browser-side helpers. Nothing here stores a token. The session lives in an httpOnly cookie
// set by the backend and forwarded through our own route handlers.

import { FAILURE } from "./messages.js";

export const CONVERSATION_STORAGE_KEYS = ["hosptic.conversations.v1", "hosptic.reports.v1"];

export async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: FAILURE.network, fields: {} };
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, status: response.status, data };
  return {
    ok: false,
    status: response.status,
    error: typeof data.error === "string" ? data.error : FAILURE.unknown,
    fields: data.fields && typeof data.fields === "object" ? data.fields : {},
  };
}

// Removes conversation and report data cached in this browser so the next person to sign in
// on the same device cannot see it.
export function clearLocalWorkspaceData() {
  try {
    for (const key of CONVERSATION_STORAGE_KEYS) window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
