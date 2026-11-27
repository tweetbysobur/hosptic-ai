"use client";

import { Plus, MessagesSquare, Database, FileText, Settings2, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import Logo from "./Logo";
import SignOutButton from "./auth/SignOutButton";
import Icon from "./ui/Icon";
import { useEffect, useState } from "react";
import { initialsFrom } from "@/lib/format";

const NAV = [
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export default function Sidebar({ view, collapsed, onToggleCollapse, onNavigate, onNew, conversations, activeId, onOpenConversation, counts, onCloseDrawer, mode = "preview", canAnalyse = true, workspace = { name: "Hospital workspace", meta: "Member" } }) {
  const recent = conversations.slice(0, 12);
  // The shortcut label is set after mount so server and client render the same text.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("⌘K");
  }, []);
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sb-top">
        <Link href="/" className="sb-brand" title="Back to home">
          <Logo size={26} title="Hosptic" />
          <div className="sb-brand-name hide-collapsed">Hosptic</div>
        </Link>
        <button className="icon-btn desktop-only" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.75} /> : <PanelLeftClose size={17} strokeWidth={1.75} />}
        </button>
        <button className="icon-btn mobile-close" onClick={onCloseDrawer} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="sb-org" title={`${workspace.name} · ${workspace.meta}`}>
        <div className="sb-org-avatar" aria-hidden="true">{initialsFrom(workspace.name)}</div>
        <div className="sb-org-text hide-collapsed">
          <div className="sb-org-name">{workspace.name}</div>
          <div className="sb-org-meta">{workspace.meta}</div>
        </div>
      </div>

      {canAnalyse && <button className="sb-new" onClick={onNew} title="New analysis">
        <Plus size={16} strokeWidth={2} />
        <span className="hide-collapsed">New analysis</span>
        <kbd className="hide-collapsed" aria-label={`Shortcut ${shortcut}`}>{shortcut}</kbd>
      </button>}

      <nav className="sb-nav">
        {NAV.filter((n) => canAnalyse || n.id === "datasets" || n.id === "settings").map((n) => (
          <button key={n.id} className="sb-link" aria-current={view === n.id || (!canAnalyse && n.id === "datasets") ? "page" : undefined} onClick={() => onNavigate(n.id)} title={n.label}>
            <n.icon size={16} strokeWidth={1.75} />
            <span className="hide-collapsed">{n.label}</span>
          </button>
        ))}
      </nav>

      {canAnalyse && <div className="sb-recent hide-collapsed" aria-label="Recent analyses" role="group">
        {recent.length === 0 && <div className="sb-empty">Your analyses will appear here.</div>}
        {recent.map((c) => (
          <button key={c.id} className="sb-item" aria-current={view === "chat" && c.id === activeId ? "true" : undefined} onClick={() => onOpenConversation(c.id)} title={c.title}>
            {c.title}
          </button>
        ))}
      </div>}
      <div style={{ flex: 1 }} />

      <div className="sb-foot">
        <div className="sb-user hide-collapsed">
          <div className="sb-user-name">{workspace.user || "Signed in"}</div>
          {workspace.email && <div className="sb-user-email">{workspace.email}</div>}
        </div>
        {mode === "live" && <SignOutButton />}
      </div>
    </aside>
  );
}
