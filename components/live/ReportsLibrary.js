"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileText, Search, RotateCcw, Plus } from "lucide-react";
import { plural } from "@/lib/format";
import { relativeTime } from "@/lib/store";

const SORTS = {
  newest: ["Newest first", (a, b) => new Date(b.created) - new Date(a.created)],
  oldest: ["Oldest first", (a, b) => new Date(a.created) - new Date(b.created)],
  title: ["Title A to Z", (a, b) => String(a.title).localeCompare(String(b.title))],
};
const STATUS = { READY: ["Ready", ""], PENDING: ["Generating", "pending"], FAILED: ["Failed", "failed"] };
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const created = (iso) => { const t = relativeTime(iso); return t === "Just now" ? "Created just now" : `Created ${t}`; };

// The organisation's PDF reports. Each row comes from the backend report record plus the analysis
// it was made from (question, method, dataset).
export function ReportsLibrary({ reports, status, onRetry, datasetName, onOpen, onDownload, onNewAnalysis }) {
  const [query, setQuery] = useState("");
  const [dataset, setDataset] = useState("all");
  const [sort, setSort] = useState("newest");
  const datasetIds = useMemo(() => [...new Set(reports.map((r) => r.datasetId).filter(Boolean))], [reports]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports
      .filter((r) => (dataset === "all" || r.datasetId === dataset) &&
        (!q || [r.title, r.question, r.method, datasetName(r.datasetId)].some((v) => String(v || "").toLowerCase().includes(q))))
      .sort(SORTS[sort][1]);
  }, [reports, query, dataset, sort, datasetName]);

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
            <button type="button" className="btn" onClick={() => { setQuery(""); setDataset("all"); }}>Clear search and filters</button>
          </div>
        ) : (
          <ul className="ds-list" aria-label="Reports">
            {shown.map((r) => {
              const [label, tone] = STATUS[r.status] || STATUS.READY;
              const ready = r.status === "READY";
              return (
                <li key={r.id} className="ds-row">
                  <div className="ds-row-main">
                    <FileText size={18} strokeWidth={1.6} className="ds-row-icon" aria-hidden="true" />
                    <div className="ds-row-text">
                      {ready ? <button type="button" className="ds-row-name" onClick={() => onOpen(r)}>{r.title}</button> : <span className="ds-row-name">{r.title}</span>}
                      <div className="ds-row-desc">{[r.method, datasetName(r.datasetId)].filter(Boolean).join(" · ") || "PDF report"}</div>
                      <div className="ds-row-meta tnum">
                        <span className={`status-dot ${tone}`}>{label}</span>
                        <span title={r.created ? new Date(r.created).toLocaleString() : undefined}>{created(r.created)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ds-row-actions">
                    {ready && <button type="button" className="btn" onClick={() => onDownload(r)}><Download size={14} /> Download</button>}
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
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>PDF reports from your organisation&rsquo;s analyses, saved for every member.</p>
            {status === "ready" && reports.length > 0 && <p className="ds-totals tnum">{plural(reports.length, "report", "reports")} from {plural(datasetIds.length, "dataset", "datasets")}</p>}
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

// One report: its facts and the PDF itself, shown in the page from the same file Download saves.
export function ReportDetail({ report, adapter, datasetName, onBack, onDownload, onAnalyse }) {
  const [file, setFile] = useState({ status: "loading", url: null, error: null });
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
            <button type="button" className="btn primary" onClick={() => onDownload(report)}><Download size={14} /> Download PDF</button>
            {onAnalyse && report.datasetId && <button type="button" className="btn" onClick={() => onAnalyse(report.datasetId)}>Analyse this dataset</button>}
          </div>
        </header>

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
          {file.status === "ready" && (
            <object data={file.url} type="application/pdf" className="rp-pdf" aria-label={`PDF of ${report.title}`}>
              <div className="rp-fallback">
                <p>This browser cannot show PDFs inside the page.</p>
                <a className="btn" href={file.url} target="_blank" rel="noopener noreferrer">Open the PDF</a>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>
  );
}
