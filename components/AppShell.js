"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import { ConversationsPage, ReportsPage, ReportView } from "./Pages";
import { loadConversations, saveConversations, loadReports, saveReports, uid, titleFrom, reportToMarkdown, downloadText } from "@/lib/store";
import { liveAdapter } from "@/lib/workspace/live-adapter";
import { useSession } from "./auth/SessionProvider";
import { ROLE_LABELS } from "@/lib/auth/session";
import LiveHome from "./live/LiveHome";
import { ConfirmProvider, useConfirm } from "./ui/ConfirmDialog";
import { permissionsFor } from "@/lib/auth/session";

const DEFAULT_DATASETS = ["maternal"];

export default function AppShell(props) {
  return (
    <ConfirmProvider>
      <WorkspaceShell {...props} />
    </ConfirmProvider>
  );
}

function WorkspaceShell({ adapter = liveAdapter }) {
  const confirm = useConfirm();
  const isLive = adapter.mode === "live";
  // Asking questions is shown only once the data source supports it.
  const canAnalyse = adapter.capabilities?.analyse === true;
  const [datasetsStatus, setDatasetsStatus] = useState("loading");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(adapter.capabilities?.analyse === false ? "datasets" : "chat");
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [openReportId, setOpenReportId] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [draftDatasets, setDraftDatasets] = useState(DEFAULT_DATASETS);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const session = useSession();
  const identity = adapter.mode === "live" && session
    ? { name: session.organization.name, meta: ROLE_LABELS[session.role] || "Member", user: session.user.fullName, email: session.user.email }
    : adapter.identity;

  const storageKeys = adapter.storage;

  useEffect(() => {
    setConversations(loadConversations(storageKeys.conversations));
    setReports(loadReports(storageKeys.reports));
    try { setCollapsed(window.localStorage.getItem("hosptic.sidebar") === "collapsed"); } catch {}
    adapter.purgeLegacy?.();
    setReady(true);
  }, [adapter, storageKeys]);

  const loadDatasets = useCallback(() => {
    setDatasetsStatus("loading");
    adapter.listDatasets()
      .then((items) => { setDatasets(items); setDatasetsStatus("ready"); })
      .catch(() => { setDatasets([]); setDatasetsStatus("error"); });
  }, [adapter]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  useEffect(() => { if (ready) saveConversations(conversations, storageKeys.conversations); }, [conversations, ready, storageKeys]);
  useEffect(() => { if (ready) saveReports(reports, storageKeys.reports); }, [reports, ready, storageKeys]);


  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try { window.localStorage.setItem("hosptic.sidebar", c ? "expanded" : "collapsed"); } catch {}
      return !c;
    });
  };

  const navigate = (v) => { setView(v); setDrawer(false); };

  const newAnalysis = useCallback(() => {
    setActiveId(null);
    setDraftDatasets(DEFAULT_DATASETS);
    setView(adapter.capabilities?.analyse === false ? "datasets" : "chat");
    setDrawer(false);
    setError(null);
  }, [adapter]);

  useEffect(() => {
    const onKey = (e) => {
      if (canAnalyse && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newAnalysis(); }
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newAnalysis, canAnalyse]);

  const openConversation = (id) => { setActiveId(id); setView("chat"); setDrawer(false); setError(null); };

  const updateConversation = (id, fn) => setConversations((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  const renameConversation = (id, title) => {
    const t = title.trim();
    if (t) updateConversation(id, (c) => ({ ...c, title: t, updatedAt: new Date().toISOString() }));
  };

  const deleteConversation = (id) => {
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const setConversationDatasets = (ids) => {
    if (active) updateConversation(active.id, (c) => ({ ...c, datasetIds: ids }));
    else setDraftDatasets(ids);
  };

  const ask = async (text) => {
    const message = text.trim();
    if (!message || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    const now = new Date().toISOString();
    let conv = active;
    if (!conv) {
      conv = { id: uid(), title: titleFrom(message), createdAt: now, updatedAt: now, datasetIds: draftDatasets, context: {}, messages: [] };
      setConversations((cs) => [conv, ...cs]);
      setActiveId(conv.id);
    }
    const id = conv.id;
    const userMsg = { id: uid(), role: "user", text: message, at: now };
    updateConversation(id, (c) => ({ ...c, messages: [...c.messages, userMsg], updatedAt: now }));
    setConversations((cs) => [cs.find((c) => c.id === id), ...cs.filter((c) => c.id !== id)].filter(Boolean));
    setPending({ conversationId: id, datasetIds: conv.datasetIds });

    try {
      const history = conv.messages.filter((m) => m.role === "assistant").map((m) => m.response);
      const response = await adapter.analyze({ message, datasetIds: conv.datasetIds, context: conv.context, history });
      let reportId = null;
      if (response.type === "report" && response.report) {
        reportId = uid();
        const rep = { id: reportId, conversationId: id, ...response.report };
        setReports((rs) => [rep, ...rs]);
        response.report.id = reportId;
      }
      updateConversation(id, (c) => ({
        ...c,
        context: response.type === "analysis" ? response.context : c.context,
        messages: [...c.messages, { id: uid(), role: "assistant", response, at: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      }));
    } catch (e) {
      setError({ conversationId: id, message: e.message || "Something went wrong", retry: message });
    } finally {
      setPending(null);
      inFlight.current = false;
    }
  };

  const retry = () => {
    if (!error) return;
    const { conversationId, retry: text } = error;
    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, -1) }));
    setTimeout(() => ask(text), 0);
  };

  const openReport = (report) => { setOpenReportId(report.id); setView("report"); setDrawer(false); };
  const downloadReport = (report) => downloadText(`${report.title.slice(0, 50).replace(/[^\w]+/g, "-").toLowerCase()}.md`, reportToMarkdown(report));
  const deleteReport = (id) => setReports((rs) => rs.filter((r) => r.id !== id));

  const openedReport = reports.find((r) => r.id === openReportId);

  const sidebarView = view === "report" ? "reports" : view;
  const mobileTitle = view === "chat" ? (isLive ? "Workspace" : active?.title || "New analysis") : { conversations: "Conversations", datasets: "Datasets", reports: "Reports", report: "Report" }[view];

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <Sidebar
        mode={adapter.mode}
        canAnalyse={adapter.capabilities?.analyse !== false}
        workspace={identity}
        view={sidebarView}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onNavigate={navigate}
        onNew={newAnalysis}
        conversations={conversations}
        activeId={activeId}
        onOpenConversation={openConversation}
        counts={{ conversations: conversations.length, reports: reports.length, datasets: datasets.length }}
        onCloseDrawer={() => setDrawer(false)}
      />
      <div className="scrim" onClick={() => setDrawer(false)} />
      <main className="main">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="topbar-title">{mobileTitle}</div>
        </div>
        {!canAnalyse && (view === "chat" || view === "datasets") && (
          <LiveHome
            datasets={datasets}
            status={datasetsStatus}
            onRetry={loadDatasets}
            canUpload={permissionsFor(session?.role).uploadDatasets}
            upload={(form) => adapter.uploadDataset(form)}
            onUploaded={loadDatasets}
            heading={view === "chat" ? "home" : "datasets"}
          />
        )}
        {canAnalyse && view === "chat" && (
          <Workspace
            key={activeId || "new"}
            conversation={active}
            datasets={datasets}
            selectedDatasets={active ? active.datasetIds : draftDatasets}
            onDatasetsChange={setConversationDatasets}
            onAsk={ask}
            pending={pending && pending.conversationId === active?.id ? pending : null}
            error={error && error.conversationId === active?.id ? error : null}
            onRetry={retry}
            onRename={(t) => active && renameConversation(active.id, t)}
            onDelete={() => active && deleteConversation(active.id)}
            onOpenReport={(r) => openReport(reports.find((x) => x.id === r.id) || r)}
            onDownloadReport={downloadReport}
            ready={ready}
          />
        )}
        {view === "conversations" && (
          <ConversationsPage conversations={conversations} onOpen={openConversation} onRename={renameConversation} onDelete={deleteConversation} onNew={newAnalysis} />
        )}
        {view === "reports" && (
          <ReportsPage reports={reports} conversations={conversations} onOpen={openReport} onDownload={downloadReport} onDelete={deleteReport} />
        )}
        {view === "report" && openedReport && (
          <ReportView report={openedReport} onBack={() => setView("reports")} onDownload={downloadReport}
            onOpenConversation={() => openConversation(openedReport.conversationId)}
            conversationExists={conversations.some((c) => c.id === openedReport.conversationId)} />
        )}
      </main>
    </div>
  );
}
