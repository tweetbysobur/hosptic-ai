"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus, MessagesSquare } from "lucide-react";
import { relativeTime } from "@/lib/store";
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
