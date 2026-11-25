"use client";

import { useState } from "react";
import Link from "next/link";
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
          <Link href="/demo" className="btn ghost btn-lg">See a sample analysis</Link>
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
            <p>Asking questions about your own datasets is being connected. The demo shows how answers will look.</p>
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
            <p>Your organisation&rsquo;s datasets. Asking questions about them is being connected.</p>
          </div>
          <div className="spacer" />
          {uploadButton}
        </div>
        <div className="list">
          {datasets.map((d) => (
            <div className="row" key={d.id}>
              <FileSpreadsheet size={18} strokeWidth={1.75} color="var(--ink-3)" />
              <div className="row-main">
                <div className="row-title">{d.name}</div>
                <div className="row-meta tnum">
                  {plural(d.rowCount ?? 0, "row", "rows")} · {plural(d.columnCount ?? 0, "column", "columns")} · {d.fileType} {fileSizeLabel(d.fileSize)} · {relativeTime(d.createdAt)}
                </div>
              </div>
              <span className={`status-dot ${d.status === "FAILED" ? "failed" : ""}`}>{STATUS[d.status] || d.status}</span>
            </div>
          ))}
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
