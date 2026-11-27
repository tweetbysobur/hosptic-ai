"use client";

import { useMemo, useState } from "react";
import { Upload, FileSpreadsheet, RotateCcw, Trash2, ArrowRight, Search, ShieldCheck } from "lucide-react";
import { plural, fileSizeLabel } from "@/lib/format";
import { relativeTime } from "@/lib/store";
import { UPLOAD_MAX_MB } from "@/lib/workspace/upload";

const STATUS = { READY: "Ready", PROCESSING: "Processing", FAILED: "Failed" };
const uploadedLabel = (iso) => { const t = relativeTime(iso); return `Uploaded ${t === "Just now" ? "just now" : t}`; };
const FILTERS = [["all", "All"], ["READY", "Ready"], ["PROCESSING", "Processing"], ["FAILED", "Failed"]];

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
export default function LiveHome({ datasets, status, onRetry, canUpload, canDelete, onUpload, onAnalyse, onDelete, onOpen = null }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return datasets.filter((d) =>
      (filter === "all" || d.status === filter) &&
      (!q || [d.name, d.description, d.originalFileName].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [datasets, query, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? datasets.length : datasets.filter((d) => d.status === k).length])), [datasets]);

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

        <div className="ds-toolbar">
          <label className="ds-search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Search datasets</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, description or file" />
          </label>
          <div className="ds-filters" role="group" aria-label="Filter by status">
            {FILTERS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, label]) => (
              <button key={k} type="button" className={`ds-filter ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label} <span className="tnum">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="ds-none" role="status">
            <p>No datasets match {query ? <>&ldquo;{query}&rdquo;</> : "this filter"}.</p>
            <button type="button" className="btn" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search</button>
          </div>
        ) : (
          <ul className="ds-list" aria-label="Datasets">
            {shown.map((d) => {
              const open = onOpen && d.status !== "PROCESSING" ? () => onOpen(d.id) : null;
              return (
                <li key={d.id} className="ds-row">
                  <div className="ds-row-main">
                    <span className="ds-row-icon" aria-hidden="true"><FileSpreadsheet size={18} strokeWidth={1.6} /></span>
                    <div className="ds-row-text">
                      {open ? (
                        <button type="button" className="ds-row-name" onClick={open}>{d.name}</button>
                      ) : (
                        <span className="ds-row-name">{d.name}</span>
                      )}
                      <div className="ds-row-desc">{d.description || d.originalFileName}</div>
                      <div className="ds-row-meta tnum">
                        <span className={`status-dot ${d.status === "FAILED" ? "failed" : d.status === "PROCESSING" ? "pending" : ""}`}>{STATUS[d.status] || d.status}</span>
                        {d.status === "READY" && <span>{(d.rowCount ?? 0).toLocaleString()} rows</span>}
                        {d.status === "READY" && <span>{plural(d.columnCount ?? 0, "column", "columns")}</span>}
                        <span>{d.fileType} · {fileSizeLabel(d.fileSize)}</span>
                        <span title={d.createdAt ? new Date(d.createdAt).toLocaleString() : undefined}>{uploadedLabel(d.createdAt)}</span>
                        {d.sensitiveColumns?.length > 0 && (
                          <span className="ds-row-flag"><ShieldCheck size={13} strokeWidth={1.75} aria-hidden="true" /> {plural(d.sensitiveColumns.length, "personal-data column", "personal-data columns")} excluded</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ds-row-actions">
                    {open && <button type="button" className="btn ghost" onClick={open}>View</button>}
                    {onAnalyse && Array.isArray(d.variables) && (
                      <button type="button" className="btn" onClick={() => onAnalyse(d.id)}>Analyse <ArrowRight size={14} /></button>
                    )}
                    {canDelete && onDelete && (
                      <button type="button" className="icon-btn" onClick={() => onDelete(d)} aria-label={`Delete ${d.name}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">{body}</div>
    </div>
  );
}
