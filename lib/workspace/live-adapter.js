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

// Turns backend errors into messages that say what to do next. `kind` lets the workspace pick the
// right state and action: rephrase, choose another dataset, sign in again, or try again.
function failure(message, kind) {
  const e = new Error(String(message || "Something went wrong").replace(/\.$/, ""));
  e.kind = kind;
  return e;
}

function friendly(error) {
  if (!(error instanceof ApiError)) return error.kind ? error : failure(error?.message, "failed");
  switch (error.code) {
    case "FORBIDDEN": return failure("Your role does not allow this. Ask an organisation administrator for access", "forbidden");
    case "UNAUTHORIZED": return failure("Your session has ended. Sign in again to continue", "session");
    case "TIMEOUT": return failure("The analysis took too long. Try a simpler question, or try again in a moment", "timeout");
    case "NETWORK_ERROR": return failure("The Hosptic service could not be reached. Check your connection and try again", "network");
    case "RATE_LIMITED": return failure("Too many requests in a short time. Wait a minute, then try again", "rate");
    case "NOT_FOUND": return failure("This dataset is no longer available. It may have been deleted", "missing");
    case "VALIDATION_ERROR":
    case "BAD_REQUEST": return failure(error.message, "invalid");
    default: return failure(error.message, error.sessionExpired ? "session" : "failed");
  }
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
  capabilities: { analyse: true, reports: true, conversationContext: false },
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
      if (!last) throw failure("Run an analysis in this conversation first, then ask for a report of it", "invalid");
      return this.createReport(last);
    }

    const datasetId = Array.isArray(datasetIds) ? datasetIds[0] : null;
    if (!datasetId) throw failure("Choose a dataset to analyse", "missing");
    if (question.length < MIN_QUESTION) throw failure(`Write a question of at least ${MIN_QUESTION} characters`, "invalid");
    const analysis = await call(() => apiClient.analysis.create({ datasetId, question: question.slice(0, MAX_QUESTION) }));
    // A FAILED analysis means the question could not be answered with this dataset's columns.
    if (analysis.status === "FAILED") throw failure(analysis.errorMessage || "The analysis could not be completed", "unsupported");
    const dataset = (Array.isArray(datasets) ? datasets : []).find((d) => d.id === datasetId);
    return analysisToResponse(analysis, dataset);
  },

  /** PDF report of one completed analysis (POST /reports). `analysis` is a workspace response. */
  async createReport(analysis) {
    const report = await call(() => apiClient.reports.create({ analysisId: analysis.analysisId, title: reportTitle(analysis.question) }));
    if (report.status === "FAILED") throw failure("The report could not be generated. Try again", "failed");
    return {
      type: "report",
      dataset: analysis.dataset,
      headline: "Your PDF report is ready",
      explanation: [`It covers the analysis "${analysis.question}". It is saved under Reports for everyone in your organisation.`],
      report: toReportEntry(report, analysis.dataset?.name),
    };
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
