"use client";

import { useState } from "react";
import { Pencil, Trash2, Download, ArrowLeft, Printer, Plus, MessagesSquare } from "lucide-react";
import { relativeTime } from "@/lib/store";
import { Evidence, Technical } from "./Response";
import { useConfirm } from "./ui/ConfirmDialog";
import { plural } from "@/lib/format";

export function ConversationsPage({ conversations, onOpen, onRename, onDelete, onNew }) {
  const confirm = useConfirm();
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
                    <div className="row-meta">{plural(n, "analysis", "analyses")} · {relativeTime(c.updatedAt)}</div>
                  </button>
                )}
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => { setEditing(c.id); setDraft(c.title); }} aria-label={`Rename ${c.title}`} title="Rename"><Pencil size={15} strokeWidth={1.75} /></button>
                  <button className="icon-btn" onClick={async () => { if (await confirm({ title: "Delete this conversation?", body: `“${c.title}” and its analyses are removed from this device. This cannot be undone.`, confirmLabel: "Delete", tone: "danger" })) onDelete(c.id); }} aria-label={`Delete ${c.title}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReportsPage({ reports, conversations, onOpen, onDownload, onDelete }) {
  const confirm = useConfirm();
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Reports</h1>
            <p>Reports compiled from your conversations. Ask &ldquo;Generate a report&rdquo; in any analysis to create one.</p>
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
                  <div className="row-meta">{plural(r.sections.length, "section", "sections")} · {r.dataset} · {relativeTime(r.created)}{conv ? ` · from “${conv.title}”` : ""}</div>
                </button>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => onDownload(r)} aria-label={`Download ${r.title}`} title="Download"><Download size={15} strokeWidth={1.75} /></button>
                  <button className="icon-btn" onClick={async () => { if (await confirm({ title: "Delete this report?", body: "The report is removed from this device. This cannot be undone.", confirmLabel: "Delete", tone: "danger" })) onDelete(r.id); }} aria-label={`Delete ${r.title}`} title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
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
