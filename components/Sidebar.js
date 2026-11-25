"use client";

import { Plus, MessagesSquare, Database, FileText, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import Logo from "./Logo";

const NAV = [
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "reports", label: "Reports", icon: FileText },
];

export default function Sidebar({ view, collapsed, onToggleCollapse, onNavigate, onNew, conversations, activeId, onOpenConversation, counts, onCloseDrawer }) {
  const recent = conversations.slice(0, 20);
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sb-top">
        <Link href="/" className="sb-brand" title="Back to home">
          <Logo size={26} title="Hosptic AI" />
          <div className="sb-brand-name hide-collapsed">Hosptic <span>AI</span></div>
        </Link>
        <button className="icon-btn desktop-only" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.75} /> : <PanelLeftClose size={17} strokeWidth={1.75} />}
        </button>
        <button className="icon-btn mobile-close" onClick={onCloseDrawer} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="sb-org" title="Hospital workspace · Demonstration data">
        <div className="sb-org-avatar">HW</div>
        <div className="sb-org-text hide-collapsed">
          <div className="sb-org-name">Hospital workspace</div>
          <div className="sb-org-meta">Demonstration data</div>
        </div>
      </div>

      <button className="sb-new" onClick={onNew} title="New analysis">
        <Plus size={16} strokeWidth={2} />
        <span className="hide-collapsed">New analysis</span>
        <kbd className="hide-collapsed">Ctrl K</kbd>
      </button>

      <nav className="sb-nav">
        {NAV.map((n) => (
          <button key={n.id} className="sb-link" aria-current={view === n.id ? "page" : undefined} onClick={() => onNavigate(n.id)} title={n.label}>
            <n.icon size={16} strokeWidth={1.75} />
            <span className="hide-collapsed">{n.label}</span>
            {counts[n.id] > 0 && <span className="count hide-collapsed tnum">{counts[n.id]}</span>}
          </button>
        ))}
      </nav>

      <div className="sb-section-label hide-collapsed">Recent analyses</div>
      <div className="sb-recent hide-collapsed">
        {recent.length === 0 && <div className="sb-empty">Your analyses will appear here.</div>}
        {recent.map((c) => (
          <button key={c.id} className="sb-item" aria-current={view === "chat" && c.id === activeId ? "true" : undefined} onClick={() => onOpenConversation(c.id)} title={c.title}>
            {c.title}
          </button>
        ))}
      </div>
      {collapsed && <div style={{ flex: 1 }} />}

      <div className="sb-foot">
        <div className="sb-user-avatar">DW</div>
        <div className="sb-user hide-collapsed">
          <div>Demo workspace</div>
          <div>Sign-in not yet available</div>
        </div>
      </div>
    </aside>
  );
}
