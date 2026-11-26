"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, RotateCcw } from "lucide-react";
import UploadDialog from "./UploadDialog";
import { plural, fileSizeLabel } from "@/lib/format";
import { relativeTime } from "@/lib/store";
import { UPLOAD_MAX_MB } from "@/lib/workspace/upload";

const STATUS = { READY: "Ready", PROCESSING: "Processing", FAILED: "Failed" };

// Home of the signed-in workspace. It shows only the organisation's own datasets.
// Until analysis of uploaded data is connected, it says so plainly instead of showing samples.
export default function LiveHome({ datasets, status, onRetry, canUpload, upload, onUploaded, heading = "home" }) {
  const [open, setOpen] = useState(false);
  const uploadButton = canUpload && (
    <button type="button" className="btn primary btn-lg" onClick={() => setOpen(true)}>
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
        <h1>Start with your first dataset</h1>
        <p className="lead">
          Upload a hospital dataset to begin. Hosptic stores it privately for your organisation and profiles every column before any analysis.
        </p>
        <div className="live-actions">
          {uploadButton || <p className="live-note">Uploading needs an administrator or researcher role. Ask one of them to add your organisation&rsquo;s first dataset.</p>}
        </div>
        <ol className="live-steps">
          <li>
            <h2>Upload</h2>
            <p>CSV or Excel, up to {UPLOAD_MAX_MB} MB. Columns named like personal identifiers are masked and never sent to the AI service.</p>
          </li>
          <li>
            <h2>Review quality</h2>
            <p>Missing values, duplicate rows, outliers and inconsistent labels are reported for each column.</p>
          </li>
          <li>
            <h2>Ask questions <span className="soon">Soon</span></h2>
            <p>Asking questions about your own datasets is being connected.</p>
          </li>
        </ol>
      </div>
    );
  } else {
    body = (
      <>
        <div className="page-head">
          <div>
            <h1>Datasets</h1>
            <p>{plural(datasets.length, "dataset", "datasets")} in your organisation. Asking questions about them is coming soon.</p>
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
                      {d.description && <div className="ds-desc">{d.description}</div>}
                    </td>
                    <td className="r">{(d.rowCount ?? 0).toLocaleString()}</td>
                    <td className="r hide-sm">{(d.columnCount ?? 0).toLocaleString()}</td>
                    <td className="hide-sm ds-muted">{d.fileType} · {fileSizeLabel(d.fileSize)}</td>
                    <td className="hide-sm ds-muted" title={d.createdAt ? new Date(d.createdAt).toLocaleString() : undefined}>{relativeTime(d.createdAt)}</td>
                    <td><span className={`status-dot ${d.status === "FAILED" ? "failed" : d.status === "PROCESSING" ? "pending" : ""}`}>{STATUS[d.status] || d.status}</span></td>
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
      <div className={heading === "home" && datasets.length === 0 && status === "ready" ? "page-inner live-inner" : "page-inner"}>{body}</div>
      <UploadDialog open={open} onClose={() => setOpen(false)} upload={upload} onUploaded={onUploaded} />
    </div>
  );
}
