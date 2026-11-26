// Live workspace data source for the signed-in /app route.
//
// It only ever shows the organisation's own records from the backend. Asking questions about uploaded
// datasets is not connected yet, so `capabilities.analyse` is false and the workspace says so.

import { apiClient } from "../api/client.js";

export const LIVE_LEGACY_KEYS = ["hosptic.conversations.v1", "hosptic.reports.v1"];

export const liveAdapter = {
  mode: "live",
  identity: { name: "Hospital workspace", meta: "Member" },
  capabilities: { analyse: false },
  storage: {
    conversations: "hosptic.live.conversations.v2",
    reports: "hosptic.live.reports.v2",
  },

  async listDatasets() {
    const data = await apiClient.datasets.list();
    return Array.isArray(data?.items) ? data.items.filter((d) => d.status !== "DELETED") : [];
  },

  async uploadDataset(form) {
    return apiClient.datasets.upload(form);
  },

  async analyze() {
    throw new Error("Analysis of your organisation's datasets is not connected yet.");
  },

  // Earlier builds kept conversations computed from bundled sample data under these keys.
  // They are removed so sample results never appear in a hospital's workspace.
  purgeLegacy() {
    try {
      for (const key of LIVE_LEGACY_KEYS) window.localStorage.removeItem(key);
    } catch {}
  },
};
