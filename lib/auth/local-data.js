// Removes conversation and report data cached in this browser, so the next person to use the
// device cannot see it.
export const LIVE_WORKSPACE_KEYS = ["hosptic.live.conversations.v2", "hosptic.live.reports.v2", "hosptic.conversations.v1", "hosptic.reports.v1"];

export function clearLocalWorkspaceData() {
  try {
    for (const key of LIVE_WORKSPACE_KEYS) window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
