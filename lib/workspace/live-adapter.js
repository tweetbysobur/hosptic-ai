// Live workspace data source. Used by the authenticated /app route.
//
// Only the existing analysis routes are called here. Authentication and organisation endpoints
// are handled by lib/auth/contract.js and are not part of the workspace data path.

export const liveAdapter = {
  mode: "live",
  identity: { name: "Hospital workspace", meta: "Demonstration data" },
  storage: {
    conversations: "hosptic.conversations.v1",
    reports: "hosptic.reports.v1",
  },

  async listDatasets() {
    const response = await fetch("/api/datasets");
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  },

  async analyze(payload) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
    }
    return response.json();
  },
};
