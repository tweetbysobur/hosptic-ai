// Live workspace data source for the signed-in /app route.
//
// Every call goes through lib/api/client.js to the backend contract (shared/contracts/openapi.yaml).
// The backend resolves the organisation from the session, so no organisation id is ever sent.
// Datasets, analyses and reports live on the backend. Conversations stay in this browser, because
// the backend has no conversation resource; each question is analysed on its own.

import { apiClient } from "../api/client.js";
import { ApiError } from "../api/errors.js";
import { analysisToResponse, toDatasetSummary, toReportEntry, REPORT_REQUEST } from "./live-mapping.js";

export const LIVE_LEGACY_KEYS = ["hosptic.conversations.v1", "hosptic.reports.v1"];

const MIN_QUESTION = 5;
const MAX_QUESTION = 1000;

// Turns backend errors into messages that say what to do next.
function friendly(error) {
  if (!(error instanceof ApiError)) return error;
  if (error.code === "FORBIDDEN") return new Error("Your role does not allow this. Ask an organisation administrator for access");
  if (error.code === "TIMEOUT") return new Error("The analysis took too long. Try a simpler question, or try again in a moment");
  if (error.code === "NETWORK_ERROR") return new Error("The Hosptic service could not be reached. Check your connection and try again");
  return new Error(String(error.message || "Something went wrong").replace(/\.$/, ""));
}

async function call(fn) {
  try {
    return await fn();
  } catch (error) {
    throw friendly(error);
  }
}

function reportTitle(question) {
  const t = String(question || "Analysis report").trim().replace(/\s+/g, " ");
  return (t.length > 150 ? `${t.slice(0, 147)}...` : t).padEnd(3, ".");
}

export const liveAdapter = {
  mode: "live",
  identity: { name: "Hospital workspace", meta: "Member" },
  capabilities: { analyse: true },
  singleDataset: true,
  storage: {
    conversations: "hosptic.live.conversations.v2",
    reports: "hosptic.live.reports.v2",
  },

  // All of the organisation's datasets for the table, with column details for those that are ready,
  // so the analysis picker and starter questions can use them.
  async listDatasets() {
    const page = await call(() => apiClient.datasets.list());
    const items = (page?.items || []).filter((d) => d.status !== "DELETED");
    return Promise.all(items.map(async (d) => {
      if (d.status !== "READY") return { ...d };
      try {
        const detail = await apiClient.datasets.get(d.id);
        return { ...d, ...toDatasetSummary(detail), rowCount: d.rowCount, columnCount: d.columnCount, createdAt: d.createdAt };
      } catch {
        return { ...d };
      }
    }));
  },

  async uploadDataset(form) {
    return call(() => apiClient.datasets.upload(form));
  },

  async deleteDataset(id) {
    await call(() => apiClient.datasets.remove(id));
  },

  async analyze({ message, datasetIds, history, datasets }) {
    const question = String(message ?? "").trim();
    const past = Array.isArray(history) ? history : [];

    if (REPORT_REQUEST.test(question)) {
      const last = [...past].reverse().find((r) => r && r.type === "analysis" && r.analysisId);
      if (!last) throw new Error("Run an analysis in this conversation first, then ask for a report of it");
      const report = await call(() => apiClient.reports.create({ analysisId: last.analysisId, title: reportTitle(last.question) }));
      if (report.status === "FAILED") throw new Error("The report could not be generated. Try again");
      return {
        type: "report",
        dataset: last.dataset,
        headline: "Your PDF report is ready",
        explanation: [`It covers the analysis "${last.question}". It is saved under Reports for everyone in your organisation.`],
        report: toReportEntry(report, last.dataset?.name),
      };
    }

    const datasetId = Array.isArray(datasetIds) ? datasetIds[0] : null;
    if (!datasetId) throw new Error("Choose a dataset to analyse");
    if (question.length < MIN_QUESTION) throw new Error(`Write a question of at least ${MIN_QUESTION} characters`);
    const analysis = await call(() => apiClient.analysis.create({ datasetId, question: question.slice(0, MAX_QUESTION) }));
    if (analysis.status === "FAILED") throw new Error(String(analysis.errorMessage || "The analysis could not be completed").replace(/\.$/, ""));
    const dataset = (Array.isArray(datasets) ? datasets : []).find((d) => d.id === datasetId);
    return analysisToResponse(analysis, dataset);
  },

  async listReports() {
    const page = await call(() => apiClient.reports.list());
    return (page?.items || []).map((r) => toReportEntry(r));
  },

  async downloadReport(report) {
    return call(() => apiClient.reports.download(report.id));
  },

  // Earlier builds kept conversations computed from bundled sample data under these keys.
  // They are removed so sample results never appear in a hospital's workspace.
  purgeLegacy() {
    try {
      for (const key of LIVE_LEGACY_KEYS) window.localStorage.removeItem(key);
    } catch {}
  },
};
