"use client";

import { useState } from "react";
import { Pencil, Trash2, Download, ArrowLeft, Printer, Plus, MessagesSquare, Upload } from "lucide-react";
import { relativeTime } from "@/lib/store";
import { Evidence, Technical } from "./Response";

export function ConversationsPage({ conversations, onOpen, onRename, onDelete, onNew }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const list = conversations.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Conversations</h1>
            <p>Every analysis is saved with its datasets and context, so you can pick up where you left off.</p>
          </div>
          <div className="spacer" />
          <input className="search" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
          <button className="btn primary" onClick={onNew}><Plus size={14} /> New analysis</button>
        </div>
        <div className="list">
          {list.length === 0 && (
            <div className="empty-list">{conversations.length ? "No conversations match your search." : "No conversations yet. Start a new analysis to create one."}</div>
          )}
          {list.map((c) => {
            const n = c.messages.filter((m) => m.role === "assistant").length;
            return (
              <div className="row" key={c.id}>
                <MessagesSquare size={16} strokeWidth={1.75} color="var(--ink-3)" />
                {editing === c.id ? (
                  <input
                    className="search" style={{ flex: 1, width: "auto" }} autoFocus value={draft} aria-label="Conversation title"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { onRename(c.id, draft); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { onRename(c.id, draft); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
                  />
                ) : (
                  <button className="row-main" onClick={() => onOpen(c.id)}>
                    <div className="row-title">{c.title}</div>
                    <div className="row-meta">{n} {n === 1 ? "analysis" : "analyses"} · {relativeTime(c.updatedAt)}</div>
                  </button>
                )}
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => { setEditing(c.id); setDraft(c.title); }} aria-label={`Rename ${c.title}`} title="Rename"><Pencil size={15} strokeWidth={1.75} /></button>
                  <button className="icon-btn" onClick={() => { if (window.confirm(`Delete "${c.title}"? This can't be undone.`)) onDelete(c.id); }} aria-label={`Delete ${c.title}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TYPE_LABEL = { numeric: "Number", binary: "Yes / no", categorical: "Category", date: "Date", text: "Text" };

function UploadCard({ onUpload }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await onUpload({ file, name });
      setMessage({ tone: "ok", text: `${created.name} is ready, with ${created.rows.toLocaleString()} rows and ${created.variables.length} columns you can analyse.` });
      setFile(null);
      setName("");
      e.target.reset();
    } catch (err) {
      setMessage({ tone: "error", text: err.message || "The file could not be uploaded" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card ds-card upload-card" onSubmit={submit}>
      <div>
        <h2>Upload a dataset</h2>
        <p className="desc">CSV (UTF-8) or Excel (.xlsx), up to 10 MB, 100,000 rows and 200 columns. Columns that look like personal data, such as names or ID numbers, are detected and never analysed or sent to the AI.</p>
      </div>
      <div className="upload-row">
        <label className="upload-field">
          <span>File</span>
          <input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy} required />
        </label>
        <label className="upload-field">
          <span>Name (optional)</span>
          <input type="text" value={name} maxLength={160} placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "For example, Maternity 2025"} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <button className="btn primary" type="submit" disabled={!file || busy}><Upload size={14} /> {busy ? "Uploading…" : "Upload"}</button>
      </div>
      {message && <p className={`upload-msg ${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    </form>
  );
}

export function DatasetsPage({ mode = "demo", datasets, loaded = true, loadError = null, onRetryLoad, onUpload, onDelete, onAnalyse }) {
  const live = mode === "live";
  const [deleting, setDeleting] = useState(null);
  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.name}? The file is removed. Analyses and reports made from it stay readable.`)) return;
    setDeleting(d.id);
    try { await onDelete(d.id); } catch (e) { window.alert(e.message || "The dataset could not be deleted"); } finally { setDeleting(null); }
  };
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Datasets</h1>
            <p>{live ? "Your organisation's datasets. Only members of your organisation can see them." : "Demonstration datasets with synthetic records. No real patient data."}</p>
          </div>
        </div>
        {live && onUpload && <UploadCard onUpload={onUpload} />}
        {loadError && (
          <div className="notice" role="alert" style={{ marginTop: 14 }}>
            <div className="notice-body">
              <div className="notice-title">Datasets could not be loaded</div>
              <div className="notice-text">{loadError}</div>
            </div>
            {onRetryLoad && <button className="btn" onClick={onRetryLoad}>Try again</button>}
          </div>
        )}
        {!loaded && <div className="list"><div className="empty-list">Loading datasets…</div></div>}
        {loaded && !loadError && datasets.length === 0 && (
          <div className="list"><div className="empty-list">{live ? "No datasets yet. Upload a CSV or Excel file above to start." : "No datasets."}</div></div>
        )}
        {datasets.map((d) => (
          <section className="card ds-card" key={d.id}>
            <div className="ds-card-head">
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2>{d.name}</h2>
                <p className="desc">{d.description}</p>
              </div>
              {onDelete && <button className="btn ghost" onClick={() => remove(d)} disabled={deleting === d.id} aria-label={`Delete ${d.name}`}><Trash2 size={14} /> {deleting === d.id ? "Deleting…" : "Delete"}</button>}
              <button className="btn primary" onClick={() => onAnalyse(d.id)}>Analyse</button>
            </div>
            <div className="ds-facts">
              <span><b>{d.rows.toLocaleString()}</b> {d.unit}</span>
              <span><b>{d.variables.length}</b> {live ? "columns to analyse" : "variables"}</span>
              <span>Source: <b>{d.source}</b></span>
              <span>{live ? "Uploaded" : "Updated"} <b>{new Date(d.updated).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</b></span>
            </div>
            <div className="var-tags">
              {d.variables.map((v) => (
                <span className="var-tag" key={v.key} title={`${TYPE_LABEL[v.type] || v.type}${v.unit ? ` · ${v.unit}` : ""}${v.missing ? ` · ${v.missing} missing` : ""}`}>{v.label}</span>
              ))}
            </div>
            {d.sensitiveColumns?.length > 0 && (
              <p className="desc" style={{ fontSize: 12.5 }}>Personal data, not analysed: {d.sensitiveColumns.join(", ")}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function ReportsPage({ reports, conversations, onOpen, onDownload, onDelete }) {
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>Reports compiled from your analyses. Ask &ldquo;Generate a report&rdquo; after any analysis to create one.</p>
          </div>
        </div>
        <div className="list">
          {reports.length === 0 && <div className="empty-list">No reports yet.</div>}
          {reports.map((r) => {
            const conv = conversations.find((c) => c.id === r.conversationId);
            return (
              <div className="row" key={r.id}>
                <button className="row-main" onClick={() => onOpen(r)}>
                  <div className="row-title">{r.title}</div>
                  <div className="row-meta">{[r.pdf ? "PDF report" : `${r.sections.length} sections`, r.dataset, relativeTime(r.created)].filter(Boolean).join(" · ")}{conv ? ` · from “${conv.title}”` : ""}</div>
                </button>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => onDownload(r)} aria-label={`Download ${r.title}`} title="Download"><Download size={15} strokeWidth={1.75} /></button>
                  {onDelete && <button className="icon-btn" onClick={() => { if (window.confirm("Delete this report? This can't be undone.")) onDelete(r.id); }} aria-label={`Delete ${r.title}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReportView({ report, onBack, onDownload, onOpenConversation, conversationExists }) {
  return (
    <div className="page">
      <div className="ws-head no-print" style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={15} /> Reports</button>
        <div style={{ flex: 1 }} />
        {conversationExists && <button className="btn ghost" onClick={onOpenConversation}>Open conversation</button>}
        <button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>
        <button className="btn primary" onClick={() => onDownload(report)}><Download size={14} /> Download</button>
      </div>
      <article className="doc">
        <div className="doc-eyebrow">Hosptic analysis report</div>
        <h1>{report.title}</h1>
        <div className="doc-meta">
          {report.dataset} · Generated {new Date(report.created).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </div>
        {report.sections.length > 1 && (
          <nav className="doc-toc" aria-label="Contents">
            <strong>Contents</strong>
            <ol>{report.sections.map((s, i) => <li key={i}>{s.headline}</li>)}</ol>
          </nav>
        )}
        {report.sections.map((s, i) => (
          <section className="doc-section" key={i}>
            <div className="doc-q">Question: {s.question}</div>
            <h2>{i + 1}. {s.headline}</h2>
            <div className="resp-explain">{(s.explanation || []).map((p, j) => <p key={j}>{p}</p>)}</div>
            <Evidence items={s.evidence} />
            {s.interpretation?.length > 0 && <ul className="interp">{s.interpretation.map((t) => <li key={t}>{t}</li>)}</ul>}
            <Technical technical={s.technical} />
          </section>
        ))}
      </article>
    </div>
  );
}
