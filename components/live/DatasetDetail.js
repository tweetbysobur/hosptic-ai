"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ShieldCheck, Trash2, RotateCcw, AlertTriangle, Info, CircleAlert } from "lucide-react";
import { plural, fileSizeLabel } from "@/lib/format";

const TYPE_LABEL = { NUMERIC: "Number", CATEGORICAL: "Category", BOOLEAN: "Yes / no", DATE: "Date", TEXT: "Text", EMPTY: "Empty" };
const SEVERITY = {
  critical: { label: "Critical", icon: CircleAlert },
  warning: { label: "Warning", icon: AlertTriangle },
  info: { label: "Note", icon: Info },
};
const TABS = [["columns", "Columns"], ["preview", "Preview"], ["quality", "Quality"]];
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(n && n / total < 0.001 ? 2 : 1)}%` : "—");

// Loads one backend resource and keeps its state; errors carry the adapter's friendly message.
function useResource(load, deps) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading", data: null, error: null });
    load()
      .then((data) => live && setState({ status: "ready", data, error: null }))
      .catch((error) => live && setState({ status: "error", data: null, error }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

function LoadError({ error, onRetry, what }) {
  return (
    <div className="notice" role="alert">
      <div className="notice-body">
        <div className="notice-title">The {what} could not be loaded</div>
        <div className="notice-text">{error?.message || "Something went wrong"}.</div>
      </div>
      {error?.kind !== "forbidden" && <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Try again</button>}
    </div>
  );
}

export default function DatasetDetail({ datasetId, adapter, permissions, onBack, onAnalyse, onDelete, initialTab = "columns" }) {
  const [tab, setTab] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : "columns");
  const [detail, retryDetail] = useResource(() => adapter.getDataset(datasetId), [datasetId]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const d = detail.data;
  const columns = useMemo(() => (d?.columns ? [...d.columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : []), [d]);
  const sensitive = columns.filter((c) => c.isSensitive).map((c) => c.name);
  const canPreview = !!permissions.previewRows;

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const url = await adapter.datasetDownloadUrl(datasetId);
      window.location.assign(url);
    } catch (e) {
      setDownloadError(e.message || "The original file could not be downloaded");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-inner ds-detail">
        <button type="button" className="ds-back" onClick={onBack}><ArrowLeft size={15} /> Datasets</button>

        {detail.status === "loading" && <div className="sr-only" role="status">Loading dataset</div>}
        {detail.status === "loading" && <div className="sk sk-title" aria-hidden="true" />}
        {detail.status === "error" && (detail.error?.kind === "missing" ? (
          <div className="ds-gone" role="alert">
            <h1>This dataset is no longer available</h1>
            <p>It may have been deleted by someone in your organisation. Analyses and reports made from it stay readable.</p>
            <button type="button" className="btn" onClick={onBack}><ArrowLeft size={14} /> Back to datasets</button>
          </div>
        ) : <LoadError error={detail.error} onRetry={retryDetail} what="dataset" />)}

        {d && (
          <>
            <header className="ds-detail-head">
              <div className="ds-detail-title">
                <h1>{d.name}</h1>
                {d.description && <p className="ds-detail-desc">{d.description}</p>}
                <dl className="ds-facts tnum">
                  <div><dt>Rows</dt><dd>{(d.rowCount ?? 0).toLocaleString()}</dd></div>
                  <div><dt>Columns</dt><dd>{(d.columnCount ?? columns.length).toLocaleString()}</dd></div>
                  <div><dt>File</dt><dd>{d.fileType} · {fileSizeLabel(d.fileSize)}</dd></div>
                  <div><dt>Uploaded</dt><dd>{dateLabel(d.createdAt)}</dd></div>
                  <div><dt>Status</dt><dd><span className={`status-dot ${d.status === "FAILED" ? "failed" : d.status === "PROCESSING" ? "pending" : ""}`}>{d.status === "READY" ? "Ready" : d.status === "FAILED" ? "Failed" : "Processing"}</span></dd></div>
                </dl>
                <p className="ds-detail-file">Original file: {d.originalFileName}</p>
              </div>
              <div className="ds-detail-actions">
                {onAnalyse && d.status === "READY" && <button type="button" className="btn primary" onClick={() => onAnalyse(d.id)}>Analyse <ArrowRight size={14} /></button>}
                {canPreview && <button type="button" className="btn" onClick={download} disabled={downloading}><Download size={14} /> {downloading ? "Preparing…" : "Original file"}</button>}
                {onDelete && <button type="button" className="icon-btn" onClick={() => onDelete(d)} aria-label={`Delete ${d.name}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>}
              </div>
            </header>
            {downloadError && <p className="ds-inline-error" role="alert">{downloadError}.</p>}

            {sensitive.length > 0 && (
              <div className="ds-privacy" role="note">
                <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                <p>
                  <strong>{plural(sensitive.length, "column looks", "columns look")} like personal data:</strong> {sensitive.join(", ")}.{" "}
                  {sensitive.length === 1 ? "It is" : "They are"} masked in previews, never sent to the AI service and cannot be used in analyses.
                </p>
              </div>
            )}

            <div className="ds-tabs" role="tablist" aria-label="Dataset details">
              {TABS.map(([k, label]) => (
                <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} className={`ds-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="ds-panel">
              {tab === "columns" && <ColumnsPanel columns={columns} rowCount={d.rowCount} />}
              {tab === "preview" && (canPreview
                ? <PreviewPanel adapter={adapter} datasetId={datasetId} />
                : <p className="ds-muted-note">Row previews are available to administrators, researchers and analysts. Your role can see column summaries and the quality report.</p>)}
              {tab === "quality" && <QualityPanel adapter={adapter} datasetId={datasetId} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ColumnsPanel({ columns, rowCount }) {
  if (!columns.length) return <p className="ds-muted-note">No column details are available for this dataset.</p>;
  return (
    <div className="card table-card">
      <div className="table-scroll">
        <table className="data ds-cols">
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Type</th>
              <th scope="col">Missing</th>
              <th scope="col" className="r">Distinct values</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => {
              const share = rowCount ? c.missingCount / rowCount : 0;
              return (
                <tr key={c.name}>
                  <td>
                    <span className="col-name">{c.name}</span>
                    {c.isSensitive && <span className="col-flag" title="Personal data: masked and excluded from analysis"><ShieldCheck size={13} strokeWidth={1.75} aria-hidden="true" /> Excluded</span>}
                  </td>
                  <td className="ds-muted">{TYPE_LABEL[c.inferredType] || c.inferredType}</td>
                  <td>
                    <div className="miss">
                      {c.missingCount > 0 && <span className="miss-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, share * 100))}%` }} className={share >= 0.2 ? "high" : ""} /></span>}
                      <span className={`tnum ${c.missingCount ? "" : "ds-quiet"}`}>{c.missingCount ? `${c.missingCount.toLocaleString()} (${pct(c.missingCount, rowCount)})` : "None"}</span>
                    </div>
                  </td>
                  <td className="r tnum">{(c.uniqueCount ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewPanel({ adapter, datasetId }) {
  const [state, retry] = useResource(() => adapter.previewDataset(datasetId, 20), [datasetId]);
  if (state.status === "loading") return <div className="live-state" role="status">Loading the first rows…</div>;
  if (state.status === "error") return <LoadError error={state.error} onRetry={retry} what="preview" />;
  const { headers = [], rows = [], maskedColumns = [], totalRows } = state.data || {};
  const masked = new Set(maskedColumns);
  return (
    <>
      <p className="ds-panel-note tnum">
        First {rows.length.toLocaleString()} of {(totalRows ?? rows.length).toLocaleString()} rows.

      </p>
      <div className="card table-card">
        <div className="table-scroll ds-preview-scroll">
          <table className="data ds-preview">
            <thead>
              <tr>
                <th scope="col" className="r row-num">#</th>
                {headers.map((h) => <th key={h} scope="col"><span className="cell-val" title={h.length > 28 ? h : undefined}>{h}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="r row-num tnum">{i + 1}</td>
                  {headers.map((h) => {
                    const v = r[h];
                    if (masked.has(h) || v === "[masked]") return <td key={h}><span className="cell-masked">masked</span></td>;
                    if (v === null || v === undefined || v === "") return <td key={h}><span className="cell-empty">—</span></td>;
                    return <td key={h} className="tnum"><span className="cell-val" title={String(v).length > 40 ? String(v) : undefined}>{v}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function QualityPanel({ adapter, datasetId }) {
  const [state, retry] = useResource(() => adapter.datasetQuality(datasetId), [datasetId]);
  if (state.status === "loading") return <div className="live-state" role="status">Loading the quality report…</div>;
  if (state.status === "error") return <LoadError error={state.error} onRetry={retry} what="quality report" />;
  const q = state.data || {};
  const issues = [...(q.issues || [])].sort((a, b) => ["critical", "warning", "info"].indexOf(a.severity) - ["critical", "warning", "info"].indexOf(b.severity));
  const missingCells = (q.columns || []).reduce((acc, c) => acc + (c.missingCount || 0), 0);
  return (
    <div className="ds-quality">
      <dl className="stat-strip">
        <div className="stat-cell"><dt>Duplicate rows</dt><dd className="tnum">{(q.duplicateRows ?? 0).toLocaleString()}</dd></div>
        <div className="stat-cell"><dt>Malformed rows</dt><dd className="tnum">{(q.malformedRows ?? 0).toLocaleString()}</dd></div>
        <div className="stat-cell"><dt>Missing values</dt><dd className="tnum">{missingCells.toLocaleString()}</dd></div>
        <div className="stat-cell"><dt>Issues found</dt><dd className="tnum">{issues.length.toLocaleString()}</dd></div>
      </dl>

      <section>
        <h2 className="ds-h2">Issues</h2>
        {issues.length === 0 ? (
          <p className="ds-muted-note">No data quality issues were found.</p>
        ) : (
          <ul className="issue-list">
            {issues.map((it, i) => {
              const sev = SEVERITY[it.severity] || SEVERITY.info;
              return (
                <li key={i} className={`issue ${it.severity}`}>
                  <sev.icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <div className="issue-head"><span className="issue-sev">{sev.label}</span>{it.column && <span className="issue-col">{it.column}</span>}</div>
                    <p>{it.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {q.columns?.length > 0 && (
        <section>
          <h2 className="ds-h2">By column</h2>
          <div className="card table-card">
            <div className="table-scroll">
              <table className="data ds-qcols">
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="r">Missing</th>
                    <th scope="col" className="r">Invalid values</th>
                    <th scope="col" className="r">Outliers</th>
                    <th scope="col">Label variants</th>
                  </tr>
                </thead>
                <tbody>
                  {q.columns.map((c) => (
                    <tr key={c.name}>
                      <td><span className="col-name">{c.name}</span>{c.isSensitive && <span className="col-flag"><ShieldCheck size={13} strokeWidth={1.75} aria-hidden="true" /> Excluded</span>}</td>
                      <td className="ds-muted">{TYPE_LABEL[c.inferredType] || c.inferredType}</td>
                      <td className={`r tnum ${c.missingCount ? (c.missingPct >= 20 ? "q-high" : "") : "ds-quiet"}`}>{c.missingCount ? `${c.missingCount.toLocaleString()} (${Number(c.missingPct ?? 0).toFixed(1)}%)` : "None"}</td>
                      <td className={`r tnum ${c.invalidValues ? "q-high" : "ds-quiet"}`}>{c.invalidValues ? c.invalidValues.toLocaleString() : "None"}</td>
                      <td className={`r tnum ${c.outliers?.count ? "" : "ds-quiet"}`} title={c.outliers?.count ? `Outside ${c.outliers.lower ?? "—"} to ${c.outliers.upper ?? "—"}` : undefined}>{c.outliers?.count ? c.outliers.count.toLocaleString() : "None"}</td>
                      <td className={c.labelVariants?.length ? "" : "ds-quiet"}>{c.labelVariants?.length ? c.labelVariants.map((v) => v.join(" / ")).join("; ") : "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {q.recommendations?.length > 0 && (
        <section>
          <h2 className="ds-h2">Recommendations</h2>
          <p className="ds-panel-note">Suggested by the quality check. Hosptic has not changed your data; apply these in your source file and upload it again.</p>
          <ul className="rec-list">{q.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      )}
      {q.generatedAt && <p className="ds-panel-note">Report generated {dateLabel(q.generatedAt)} when the file was uploaded.</p>}
    </div>
  );
}
