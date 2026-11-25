// Demo workspace data source. Runs entirely in the browser with synthetic datasets.
//
// Isolation guarantees (covered by tests/demo):
//   1. No network calls: no fetch, no /api routes, no authentication module.
//   2. Separate storage keys under "hosptic.demo.", never the live keys.
//   3. Only the bundled synthetic datasets can be analysed.

import { analyze } from "../engine.js";
import { DATASETS, datasetSummary } from "../datasets.js";
import { buildDemoSeed } from "./demo-seed.js";

const DEMO_DATASET_IDS = Object.keys(DATASETS);
const MAX_QUESTION_LENGTH = 1000;

export const demoAdapter = {
  mode: "demo",
  identity: { name: "Demo workspace", meta: "Synthetic data only" },
  storage: {
    conversations: "hosptic.demo.conversations.v1",
    reports: "hosptic.demo.reports.v1",
    seeded: "hosptic.demo.seeded.v1",
  },

  async listDatasets() {
    return DEMO_DATASET_IDS.map((id) => ({ ...datasetSummary(id), synthetic: true }));
  },

  async analyze(payload) {
    const datasetIds = (Array.isArray(payload?.datasetIds) ? payload.datasetIds : []).filter((id) => DEMO_DATASET_IDS.includes(id));
    if (!datasetIds.length) throw new Error("Choose a demonstration dataset to analyse.");
    const message = String(payload?.message ?? "").trim().slice(0, MAX_QUESTION_LENGTH);
    if (!message) throw new Error("Enter a question to analyse.");
    return analyze({
      message,
      datasetIds,
      context: payload?.context && typeof payload.context === "object" ? payload.context : {},
      history: Array.isArray(payload?.history) ? payload.history : [],
    });
  },

  seed() {
    return buildDemoSeed(new Date());
  },
};
