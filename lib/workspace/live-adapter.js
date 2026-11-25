// Live workspace data source. Used by the authenticated /app route.
//
// Every call goes through lib/api/client.js to the backend contract (shared/contracts/openapi.yaml).
// The backend resolves the organisation from the session, so no organisation id is ever sent.
// Conversations stay in this browser (the backend has no conversation resource); datasets,
// analyses and reports live on the backend.

import { apiClient } from "../api/client.js";
import { ApiError } from "../api/errors.js";
import { analysisToResponse, toDatasetSummary, toReportEntry, REPORT_REQUEST } from "./live-mapping.js";

const MIN_QUESTION = 5;
const MAX_QUESTION = 1000;

// Turns backend errors into messages that tell the user what to do next.
function friendly(error) {
  if (!(error instanceof ApiError)) return error;
  if (error.code === "FORBIDDEN") return new Error("Your role does not allow this. Ask an organisation administrator for access");
  if (error.code === "TIMEOUT") return new Error("The analysis took too long. Try a simpler question, or try again in a moment");
  return new Error(error.message.replace(/\.$/, ""));
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
  singleDataset: true,
  canUpload: true,
  identity: { name: "Hospital workspace", meta: "Signed in" },
  storage: {
    conversations: "hosptic.conversations.v1",
    reports: "hosptic.reports.v1",
  },

  async listDatasets() {
    const page = await call(() => apiClient.datasets.list());
    const ready = (page?.items || []).filter((d) => d.status === "READY");
    const details = await Promise.all(ready.map((d) => call(() => apiClient.datasets.get(d.id))));
    return details.map(toDatasetSummary);
  },

  async uploadDataset({ file, name }) {
    if (!file) throw new Error("Choose a CSV or Excel file to upload");
    if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Only .csv and .xlsx files can be uploaded");
    return toDatasetSummary(await call(() => apiClient.datasets.upload({ file, name: name?.trim() || undefined })));
  },

  async deleteDataset(id) {
    await call(() => apiClient.datasets.remove(id));
  },

  async analyze({ message, datasetIds, history, datasets }) {
    const question = String(message ?? "").trim();
    const history_ = Array.isArray(history) ? history : [];

    if (REPORT_REQUEST.test(question)) {
      const last = [...history_].reverse().find((r) => r && r.type === "analysis" && r.analysisId);
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
    if (analysis.status === "FAILED") throw new Error((analysis.errorMessage || "The analysis could not be completed").replace(/\.$/, ""));
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
};
