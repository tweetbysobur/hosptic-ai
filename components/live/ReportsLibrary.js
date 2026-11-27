"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, Search, RotateCcw, Plus, MoreHorizontal, Eye, Database, MessagesSquare, Loader2 } from "lucide-react";
import { plural } from "@/lib/format";
import { relativeTime } from "@/lib/store";

const SORTS = {
  newest: ["Newest first", (a, b) => new Date(b.created) - new Date(a.created)],
  oldest: ["Oldest first", (a, b) => new Date(a.created) - new Date(b.created)],
  title: ["Title A to Z", (a, b) => String(a.title).localeCompare(String(b.title))],
};
const DAY = 86400000;
const PERIODS = [["any", "Any time", Infinity], ["7", "Past 7 days", 7 * DAY], ["30", "Past 30 days", 30 * DAY], ["365", "Past year", 365 * DAY]];

// Secondary actions for one report. Closes on outside click and Escape.
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
            <button key={it.label} type="button" role="menuitem" className="row-menu-item" onClick={() => { setOpen(false); it.onClick(); }}>
              <it.icon size={15} strokeWidth={1.75} aria-hidden="true" /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Download with visible progress and an inline error, shared by the list and the report page.
function useDownload(onDownload) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const run = async (report) => {
    setBusy(report.id);
    setError(null);
    try {
      await onDownload(report);
    } catch (e) {
      setError({ id: report.id, message: e?.message || "The report could not be downloaded" });
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

const STATUS = { READY: ["Ready", ""], PENDING: ["Generating", "pending"], FAILED: ["Failed", "failed"] };
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const created = (iso) => { const t = relativeTime(iso); return t === "Just now" ? "Created just now" : `Created ${t}`; };

// The organisation's PDF reports. Each row comes from the backend report record plus the analysis
// it was made from (question, method, dataset).
export function ReportsLibrary({ reports, status, onRetry, datasetName, onOpen, onDownload, onNewAnalysis, onOpenDataset, findConversation }) {
  const [query, setQuery] = useState("");
  const [dataset, setDataset] = useState("all");
  const [period, setPeriod] = useState("any");
  const [sort, setSort] = useState("newest");
  const download = useDownload(onDownload);
  const datasetIds = useMemo(() => [...new Set(reports.map((r) => r.datasetId).filter(Boolean))], [reports]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const span = PERIODS.find(([k]) => k === period)?.[2] ?? Infinity;
    const now = Date.now();
    return reports
      .filter((r) => (dataset === "all" || r.datasetId === dataset) &&
        (span === Infinity || now - new Date(r.created).getTime() <= span) &&
        (!q || [r.title, r.question, r.method, datasetName(r.datasetId)].some((v) => String(v || "").toLowerCase().includes(q))))
      .sort(SORTS[sort][1]);
  }, [reports, query, dataset, period, sort, datasetName]);
  const latest = useMemo(() => reports.reduce((m, r) => (!m || new Date(r.created) > new Date(m) ? r.created : m), null), [reports]);

  let body;
  if (status === "loading") {
    body = (
      <ul className="ds-list sk-list" aria-label="Loading reports">
        {[0, 1, 2].map((i) => <li key={i} className="ds-row"><div className="sk sk-row" /></li>)}
      </ul>
    );
  } else if (status === "error") {
    body = (
      <div className="notice" role="alert">
        <div className="notice-body">
          <div className="notice-title">Your reports could not be loaded</div>
          <div className="notice-text">Check your connection, then try again.</div>
        </div>
        <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Try again</button>
      </div>
    );
  } else if (reports.length === 0) {
    body = (
      <div className="rp-empty">
        <FileText size={28} strokeWidth={1.4} aria-hidden="true" />
        <h2>No reports yet</h2>
        <p>Run an analysis, then choose Create PDF report under the answer. Reports are saved here for everyone in your organisation.</p>
        {onNewAnalysis && <button type="button" className="btn primary" onClick={onNewAnalysis}><Plus size={14} /> New analysis</button>}
      </div>
    );
  } else {
    body = (
      <>
        <div className="ds-toolbar">
          <label className="ds-search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Search reports</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title, question, method or dataset" />
          </label>
          <div className="ds-selects">
            {datasetIds.length > 1 && (
              <label className="ds-select"><span className="sr-only">Dataset</span>
                <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
                  <option value="all">All datasets</option>
                  {datasetIds.map((id) => <option key={id} value={id}>{datasetName(id)}</option>)}
                </select>
              </label>
            )}
            <label className="ds-select"><span className="sr-only">Created</span>
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
        </div>
        {shown.length === 0 ? (
          <div className="ds-none" role="status">
            <p>No reports match {query ? <>&ldquo;{query}&rdquo;</> : "this filter"}.</p>
            <button type="button" className="btn" onClick={() => { setQuery(""); setDataset("all"); setPeriod("any"); }}>Clear search and filters</button>
          </div>
        ) : (
          <ul className="ds-list" aria-label="Reports">
            {shown.map((r) => {
              const [label, tone] = STATUS[r.status] || STATUS.READY;
              const ready = r.status === "READY";
              const conversation = findConversation?.(r.analysisId);
              const menu = [
                ready && { label: "View PDF", icon: Eye, onClick: () => onOpen(r) },
                ready && { label: "Download PDF", icon: Download, onClick: () => download.run(r) },
                onOpenDataset && r.datasetId && datasetName(r.datasetId) !== "Deleted dataset" && { label: "Open dataset", icon: Database, onClick: () => onOpenDataset(r.datasetId) },
                conversation && { label: "Open analysis", icon: MessagesSquare, onClick: () => conversation.open() },
              ].filter(Boolean);
              return (
                <li key={r.id} className="ds-row">
                  <div className="ds-row-main">
                    <FileText size={18} strokeWidth={1.6} className="ds-row-icon" aria-hidden="true" />
                    <div className="ds-row-text">
                      {ready ? <button type="button" className="ds-row-name" onClick={() => onOpen(r)}>{r.title}</button> : <span className="ds-row-name">{r.title}</span>}
                      <div className="ds-row-desc">{[r.method, datasetName(r.datasetId)].filter(Boolean).join(" · ") || "PDF report"}</div>
                      <div className="ds-row-meta tnum">
                        <span className={`status-dot ${tone}`}>{label}</span>
                        <span>PDF</span>
                        <span title={r.created ? new Date(r.created).toLocaleString() : undefined}>{created(r.created)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ds-row-actions">
                    {ready && (
                      <button type="button" className="btn" onClick={() => download.run(r)} disabled={download.busy === r.id}>
                        {download.busy === r.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {download.busy === r.id ? "Downloading…" : "Download"}
                      </button>
                    )}
                    {menu.length > 0 && <RowMenu name={r.title} items={menu} />}
                  </div>
                  {download.error?.id === r.id && <p className="rp-row-error" role="alert">{download.error.message}.</p>}
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
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>PDF reports from your organisation&rsquo;s analyses, saved for every member.</p>
            {status === "ready" && reports.length > 0 && (
              <p className="ds-totals tnum">
                {plural(reports.length, "report", "reports")} from {plural(datasetIds.length, "dataset", "datasets")} · latest {created(latest).replace("Created ", "")}
              </p>
            )}
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

// One report: its facts and the PDF itself, shown in the page from the same file Download saves.
export function ReportDetail({ report, adapter, datasetName, onBack, onDownload, onOpenDataset, conversation }) {
  const download = useDownload(onDownload);
  const [file, setFile] = useState({ status: "loading", url: null, error: null });
  // Browsers report whether they can show PDFs in the page (false on most phones and in headless
  // browsers). Without a viewer, a compact panel replaces the empty frame.
  const [inline, setInline] = useState(true);
  useEffect(() => { if (typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false) setInline(false); }, []);
  useEffect(() => {
    let live = true;
    let url = null;
    adapter.downloadReport(report)
      .then(({ blob }) => {
        url = URL.createObjectURL(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
        if (live) setFile({ status: "ready", url, error: null });
      })
      .catch((error) => live && setFile({ status: "error", url: null, error }));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [adapter, report]);

  return (
    <div className="page">
      <div className="page-inner rp-detail">
        <button type="button" className="ds-back" onClick={onBack}><ArrowLeft size={15} /> Reports</button>
        <header className="ds-detail-head">
          <div className="ds-detail-title">
            <h1>{report.title}</h1>
            {report.question && report.question !== report.title && <p className="ds-detail-desc">{report.question}</p>}
            <dl className="ds-facts tnum">
              {report.method && <div><dt>Method</dt><dd>{report.method}</dd></div>}
              {report.datasetId && <div><dt>Dataset</dt><dd>{datasetName(report.datasetId)}</dd></div>}
              <div><dt>Created</dt><dd>{dateLabel(report.created)}</dd></div>
            </dl>
          </div>
          <div className="ds-detail-actions">
            <button type="button" className="btn primary" onClick={() => download.run(report)} disabled={download.busy === report.id}>
              {download.busy === report.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {download.busy === report.id ? "Downloading…" : "Download PDF"}
            </button>
            {conversation && <button type="button" className="btn" onClick={conversation.open}><MessagesSquare size={14} /> Open analysis</button>}
            {onOpenDataset && report.datasetId && datasetName(report.datasetId) !== "Deleted dataset" && <button type="button" className="btn" onClick={() => onOpenDataset(report.datasetId)}><Database size={14} /> Open dataset</button>}
          </div>
        </header>
        {download.error && <p className="ds-inline-error" role="alert">{download.error.message}.</p>}

        <div className="rp-viewer">
          {file.status === "loading" && <div className="rp-viewer-state" role="status"><div className="sk rp-sk" /></div>}
          {file.status === "error" && (
            <div className="notice" role="alert">
              <div className="notice-body">
                <div className="notice-title">The report could not be shown</div>
                <div className="notice-text">{file.error?.message || "Something went wrong"}. You can still try Download PDF.</div>
              </div>
            </div>
          )}
          {file.status === "ready" && inline && (
            <object data={file.url} type="application/pdf" className="rp-pdf" aria-label={`PDF of ${report.title}`}>
              <div className="rp-fallback">
                <p>This browser cannot show PDFs inside the page.</p>
                <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer">Open the PDF</a>
              </div>
            </object>
          )}
          {file.status === "ready" && !inline && (
            <div className="rp-compact">
              <FileText size={22} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="rp-compact-title">PDF ready</p>
                <p className="rp-compact-text">This browser opens PDFs in their own viewer.</p>
              </div>
              <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer"><Eye size={14} /> Open the PDF</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
