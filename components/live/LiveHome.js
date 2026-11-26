"use client";

import { Upload, FileSpreadsheet, RotateCcw, Trash2, ArrowRight } from "lucide-react";
import { plural, fileSizeLabel } from "@/lib/format";
import { relativeTime } from "@/lib/store";
import { UPLOAD_MAX_MB } from "@/lib/workspace/upload";

const STATUS = { READY: "Ready", PROCESSING: "Processing", FAILED: "Failed" };

const STEPS = [
  {
    title: "Upload a dataset",
    text: `Add a CSV or Excel file, up to ${UPLOAD_MAX_MB} MB. It is stored privately for your organisation.`,
  },
  {
    title: "Review data quality",
    text: "Every column is profiled. Missing values, duplicate rows, outliers and inconsistent labels are reported.",
  },
  {
    title: "Ask questions",
    text: "Ask in plain language. Hosptic chooses a suitable statistical method, runs it and explains the result.",
  },
];

// The organisation's datasets, or a first-use guide when there are none yet.
export default function LiveHome({ datasets, status, onRetry, canUpload, canDelete, onUpload, onAnalyse, onDelete }) {
  const uploadButton = canUpload && (
    <button type="button" className="btn primary btn-lg" onClick={onUpload}>
      <Upload size={16} strokeWidth={2} /> Upload dataset
    </button>
  );

  let body;
  if (status === "loading") {
    body = <div className="live-state" role="status">Loading your datasets…</div>;
  } else if (status === "error") {
    body = (
      <div className="notice" role="alert">
        <div className="notice-body">
          <div className="notice-title">Your datasets could not be loaded</div>
          <div className="notice-text">Check your connection, then try again.</div>
        </div>
        <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Try again</button>
      </div>
    );
  } else if (datasets.length === 0) {
    body = (
      <div className="live-empty">
        <div className="live-empty-head">
          <h1>Start with your first dataset</h1>
          <p className="lead">Three steps from a spreadsheet to a clear, checked answer.</p>
          <div className="live-actions">
            {uploadButton || <p className="live-note">Uploading needs an administrator or researcher role. Ask one of them to add your organisation&rsquo;s first dataset.</p>}
          </div>
        </div>
        <ol className="step-cards">
          {STEPS.map((step, i) => (
            <li key={step.title} className="step-card">
              <span className="step-number" aria-hidden="true">{i + 1}</span>
              <h2><span className="sr-only">Step {i + 1}: </span>{step.title}</h2>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="live-footnote">Columns named like personal identifiers are masked and never sent to the AI service.</p>
      </div>
    );
  } else {
    body = (
      <>
        <div className="page-head">
          <div>
            <h1>Datasets</h1>
            <p>{plural(datasets.length, "dataset", "datasets")} in your organisation. Only your organisation&rsquo;s members can see them.</p>
          </div>
          <div className="spacer" />
          {uploadButton}
        </div>
        <div className="card ds-table-card">
          <div className="table-scroll">
            <table className="data ds-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className="r">Rows</th>
                  <th scope="col" className="r hide-sm">Columns</th>
                  <th scope="col" className="hide-sm">File</th>
                  <th scope="col" className="hide-sm">Uploaded</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="ds-name">
                        <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden="true" />
                        <span>{d.name}</span>
                      </div>
                      {d.sensitiveColumns?.length > 0 && <div className="ds-desc">Not analysed (personal data): {d.sensitiveColumns.join(", ")}</div>}
                    </td>
                    <td className="r">{(d.rowCount ?? 0).toLocaleString()}</td>
                    <td className="r hide-sm">{(d.columnCount ?? 0).toLocaleString()}</td>
                    <td className="hide-sm ds-muted">{d.fileType} · {fileSizeLabel(d.fileSize)}</td>
                    <td className="hide-sm ds-muted" title={d.createdAt ? new Date(d.createdAt).toLocaleString() : undefined}>{relativeTime(d.createdAt)}</td>
                    <td><span className={`status-dot ${d.status === "FAILED" ? "failed" : d.status === "PROCESSING" ? "pending" : ""}`}>{STATUS[d.status] || d.status}</span></td>
                    <td className="ds-actions">
                      {onAnalyse && Array.isArray(d.variables) && (
                        <button type="button" className="btn" onClick={() => onAnalyse(d.id)}>Analyse <ArrowRight size={14} /></button>
                      )}
                      {canDelete && onDelete && (
                        <button type="button" className="icon-btn" onClick={() => onDelete(d)} aria-label={`Delete ${d.name}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">{body}</div>
    </div>
  );
}
