"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, RotateCcw, Trash2, ArrowRight, Search, MoreHorizontal, Table2, ClipboardCheck, FolderOpen } from "lucide-react";
import { plural, fileSizeLabel } from "@/lib/format";
import { relativeTime } from "@/lib/store";
import { UPLOAD_MAX_MB } from "@/lib/workspace/upload";

const STATUS = { READY: "Ready", PROCESSING: "Processing", FAILED: "Failed" };
const uploadedLabel = (iso) => { const t = relativeTime(iso); return `Uploaded ${t === "Just now" ? "just now" : t}`; };
const FILTERS = [["all", "All"], ["READY", "Ready"], ["PROCESSING", "Processing"], ["FAILED", "Failed"]];
const DAY = 86400000;
const PERIODS = [["any", "Any time", Infinity], ["7", "Past 7 days", 7 * DAY], ["30", "Past 30 days", 30 * DAY], ["365", "Past year", 365 * DAY]];
const SORTS = {
  newest: ["Newest first", (a, b) => new Date(b.createdAt) - new Date(a.createdAt)],
  oldest: ["Oldest first", (a, b) => new Date(a.createdAt) - new Date(b.createdAt)],
  name: ["Name A to Z", (a, b) => String(a.name).localeCompare(String(b.name))],
  size: ["Largest first", (a, b) => (b.fileSize ?? 0) - (a.fileSize ?? 0)],
};
const QUALITY = {
  clean: ["No issues", "ok"],
  info: ["Notes", "note"],
  warning: ["Warnings", "warn"],
  critical: ["Critical issues", "critical"],
};

function qualityLabel(q) {
  if (!q) return null;
  if (q.level === "clean") return { text: "No quality issues", tone: "ok" };
  const n = q.counts[q.level];
  const word = { critical: ["critical issue", "critical issues"], warning: ["warning", "warnings"], info: ["quality note", "quality notes"] }[q.level];
  return { text: `${n} ${n === 1 ? word[0] : word[1]}`, tone: QUALITY[q.level][1] };
}

// Row menu: the dataset's secondary actions. Closes on outside click and Escape.
function RowMenu({ name, items }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="row-menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={`More actions for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { setUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 260); setOpen((o) => !o); }}>
        <MoreHorizontal size={17} strokeWidth={1.75} />
      </button>
      {open && (
        <div className={`row-menu-pop ${up ? "up" : ""}`} role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={`row-menu-item ${it.danger ? "danger" : ""}`} onClick={() => { setOpen(false); it.onClick(); }}>
              <it.icon size={15} strokeWidth={1.75} aria-hidden="true" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
export default function LiveHome({ datasets, status, onRetry, canUpload, canDelete, canPreview = true, onUpload, onAnalyse, onDelete, onOpen = null }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [period, setPeriod] = useState("any");
  const [sort, setSort] = useState("newest");
  const types = useMemo(() => [...new Set(datasets.map((d) => d.fileType).filter(Boolean))].sort(), [datasets]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const span = PERIODS.find(([k]) => k === period)?.[2] ?? Infinity;
    const now = Date.now();
    return datasets
      .filter((d) =>
        (filter === "all" || d.status === filter) &&
        (type === "all" || d.fileType === type) &&
        (span === Infinity || now - new Date(d.createdAt).getTime() <= span) &&
        (!q || [d.name, d.description, d.originalFileName].some((v) => String(v || "").toLowerCase().includes(q))))
      .sort(SORTS[sort][1]);
  }, [datasets, query, filter, type, period, sort]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? datasets.length : datasets.filter((d) => d.status === k).length])), [datasets]);
  const filtered = query || filter !== "all" || type !== "all" || period !== "any";
  const clearAll = () => { setQuery(""); setFilter("all"); setType("all"); setPeriod("any"); };
  const totals = useMemo(() => ({
    rows: datasets.reduce((a, d) => a + (d.status === "READY" ? d.rowCount ?? 0 : 0), 0),
    bytes: datasets.reduce((a, d) => a + (d.fileSize ?? 0), 0),
  }), [datasets]);

  const uploadButton = canUpload && (
    <button type="button" className="btn primary btn-lg" onClick={onUpload}>
      <Upload size={16} strokeWidth={2} /> Upload dataset
    </button>
  );

  let body;
  if (status === "loading") {
    body = (
      <div role="status" aria-label="Loading your datasets">
        <div className="sk sk-title" />
        <div className="sk sk-line" />
        <ul className="ds-list sk-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="ds-row"><div className="sk sk-row" /></li>
          ))}
        </ul>
      </div>
    );
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
            <p>Your organisation&rsquo;s uploaded data. Only members of your organisation can see it.</p>
            <p className="ds-totals tnum">
              {plural(datasets.length, "dataset", "datasets")} · {totals.rows.toLocaleString()} rows · {fileSizeLabel(totals.bytes)} stored
            </p>
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
          <div className="ds-selects">
            {types.length > 1 && (
              <label className="ds-select"><span className="sr-only">File type</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="all">All file types</option>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
            <label className="ds-select"><span className="sr-only">Uploaded</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="ds-select"><span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          </div>
          {FILTERS.filter(([k]) => k !== "all" && counts[k] > 0).length > 1 && <div className="ds-filters" role="group" aria-label="Filter by status">
            {FILTERS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, label]) => (
              <button key={k} type="button" className={`ds-filter ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label} <span className="tnum">{counts[k]}</span>
              </button>
            ))}
          </div>}
        </div>

        {shown.length === 0 ? (
          <div className="ds-none" role="status">
            <p>No datasets match {query ? <>&ldquo;{query}&rdquo;</> : "these filters"}.</p>
            {filtered && <button type="button" className="btn" onClick={clearAll}>Clear search and filters</button>}
          </div>
        ) : (
          <ul className="ds-list" aria-label="Datasets">
            {shown.map((d) => {
              const open = onOpen && d.status !== "PROCESSING" ? (tab) => onOpen(d.id, typeof tab === "string" ? tab : "columns") : null;
              const quality = qualityLabel(d.qualitySummary);
              const menu = [
                open && { label: "Open dataset", icon: FolderOpen, onClick: () => open("columns") },
                open && canPreview && d.status === "READY" && { label: "Preview rows", icon: Table2, onClick: () => open("preview") },
                open && d.status === "READY" && { label: "Data quality", icon: ClipboardCheck, onClick: () => open("quality") },
                canDelete?.(d) && onDelete && { label: "Delete dataset", icon: Trash2, danger: true, onClick: () => onDelete(d) },
              ].filter(Boolean);
              return (
                <li key={d.id} className="ds-row">
                  <div className="ds-row-main">
                    <FileSpreadsheet size={18} strokeWidth={1.6} className="ds-row-icon" aria-hidden="true" />
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
                        {quality && <span className={`ds-quality-tag ${quality.tone}`}>{quality.text}</span>}
                        {d.sensitiveColumns?.length > 0 && (
                          <span className="ds-row-flag">{plural(d.sensitiveColumns.length, "personal-data column", "personal-data columns")} excluded</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="ds-row-actions">
                    {onAnalyse && Array.isArray(d.variables) && (
                      <button type="button" className="btn" onClick={() => onAnalyse(d.id)}>Analyse <ArrowRight size={14} /></button>
                    )}
                    {menu.length > 0 && <RowMenu name={d.name} items={menu} />}
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
