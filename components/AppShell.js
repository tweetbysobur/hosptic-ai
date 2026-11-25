"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import { ConversationsPage, DatasetsPage, ReportsPage, ReportView } from "./Pages";
import { loadConversations, saveConversations, loadReports, saveReports, uid, titleFrom, reportToMarkdown, downloadText, downloadBlob } from "@/lib/store";
import { liveAdapter } from "@/lib/workspace/live-adapter";
import { useSession } from "./auth/SessionProvider";
import { ROLE_LABELS } from "@/lib/auth/session";
import DemoBanner from "./demo/DemoBanner";

const DEMO_DEFAULT_DATASETS = ["maternal"];

export default function AppShell({ adapter = liveAdapter }) {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("chat");
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [openReportId, setOpenReportId] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoaded, setDatasetsLoaded] = useState(false);
  const [datasetsError, setDatasetsError] = useState(null);
  // Live workspaces start on the organisation's first dataset; the demo starts on the maternal set.
  const DEFAULT_DATASETS = useMemo(() => (adapter.mode === "live" ? (datasets[0] ? [datasets[0].id] : []) : DEMO_DEFAULT_DATASETS), [adapter.mode, datasets]);
  const [draftDatasets, setDraftDatasets] = useState(adapter.mode === "live" ? [] : DEMO_DEFAULT_DATASETS);
  const remoteReports = typeof adapter.listReports === "function";
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const session = useSession();
  const identity = adapter.mode === "live" && session
    ? { name: session.organization.name, meta: ROLE_LABELS[session.role] || "Member" }
    : adapter.identity;

  const storageKeys = adapter.storage;

  // Demo workspaces start with completed sample analyses. The seeded flag stops them being
  // recreated on every visit, so changes a judge makes are kept until they reset the demo.
  const seedDemo = useCallback(() => {
    const seed = adapter.seed();
    saveConversations(seed.conversations, storageKeys.conversations);
    saveReports(seed.reports, storageKeys.reports);
    try { window.localStorage.setItem(storageKeys.seeded, "1"); } catch {}
    return seed;
  }, [adapter, storageKeys]);

  useEffect(() => {
    let alreadySeeded = true;
    if (adapter.seed && storageKeys.seeded) {
      try { alreadySeeded = window.localStorage.getItem(storageKeys.seeded) !== null; } catch { alreadySeeded = false; }
    }
    const seeded = adapter.seed && !alreadySeeded ? seedDemo() : null;
    setConversations(seeded ? seeded.conversations : loadConversations(storageKeys.conversations));
    if (!remoteReports) setReports(seeded ? seeded.reports : loadReports(storageKeys.reports));
    try { setCollapsed(window.localStorage.getItem("hosptic.sidebar") === "collapsed"); } catch {}
    setReady(true);
  }, [adapter, seedDemo, storageKeys, remoteReports]);

  const refreshDatasets = useCallback(() => {
    setDatasetsError(null);
    return adapter.listDatasets()
      .then((list) => { setDatasets(list); return list; })
      .catch((e) => { setDatasets([]); setDatasetsError(e.message || "Datasets could not be loaded"); return []; })
      .finally(() => setDatasetsLoaded(true));
  }, [adapter]);

  const refreshReports = useCallback(() => {
    if (!remoteReports) return Promise.resolve();
    return adapter.listReports().then(setReports).catch(() => {});
  }, [adapter, remoteReports]);

  useEffect(() => { refreshDatasets(); refreshReports(); }, [refreshDatasets, refreshReports]);

  // Select the first dataset once the organisation's datasets arrive.
  useEffect(() => {
    if (adapter.mode === "live" && !activeId && draftDatasets.length === 0 && datasets[0]) setDraftDatasets([datasets[0].id]);
  }, [adapter.mode, activeId, draftDatasets.length, datasets]);

  useEffect(() => { if (ready) saveConversations(conversations, storageKeys.conversations); }, [conversations, ready, storageKeys]);
  useEffect(() => { if (ready && !remoteReports) saveReports(reports, storageKeys.reports); }, [reports, ready, storageKeys, remoteReports]);

  const resetDemo = () => {
    if (!window.confirm("Reset the demo? Sample conversations and reports will return to their original state.")) return;
    const seed = seedDemo();
    setConversations(seed.conversations);
    setReports(seed.reports);
    setActiveId(null);
    setDraftDatasets(DEFAULT_DATASETS);
    setView("chat");
    setDrawer(false);
    setError(null);
  };

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
    setView("chat");
    setDrawer(false);
    setError(null);
  }, [DEFAULT_DATASETS]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newAnalysis(); }
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newAnalysis]);

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
      const response = await adapter.analyze({ message, datasetIds: conv.datasetIds, context: conv.context, history, datasets });
      if (response.type === "report" && response.report) {
        if (response.report.pdf) {
          // Backend reports keep their own id; the list is reloaded so it matches the server.
          refreshReports();
        } else {
          const reportId = uid();
          setReports((rs) => [{ id: reportId, conversationId: id, ...response.report }, ...rs]);
          response.report.id = reportId;
        }
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

  const fileBase = (report) => report.title.slice(0, 50).replace(/[^\w]+/g, "-").toLowerCase();
  const downloadReport = async (report) => {
    if (!report.pdf) return downloadText(`${fileBase(report)}.md`, reportToMarkdown(report));
    try {
      const { blob, fileName } = await adapter.downloadReport(report);
      downloadBlob(fileName || `${fileBase(report)}.pdf`, blob);
    } catch (e) {
      window.alert(`The report could not be downloaded. ${e.message || ""}`.trim());
    }
  };
  // PDF reports open as a download; the in-app reader is for the demo's compiled reports.
  const openReport = (report) => {
    if (report.pdf) return downloadReport(report);
    setOpenReportId(report.id); setView("report"); setDrawer(false);
  };
  const deleteReport = remoteReports ? null : (id) => setReports((rs) => rs.filter((r) => r.id !== id));

  const uploadDataset = adapter.canUpload
    ? async ({ file, name }) => {
        const created = await adapter.uploadDataset({ file, name });
        await refreshDatasets();
        return created;
      }
    : null;
  const deleteDataset = adapter.canUpload
    ? async (id) => {
        await adapter.deleteDataset(id);
        setDraftDatasets((ids) => ids.filter((x) => x !== id));
        await refreshDatasets();
      }
    : null;

  const openedReport = reports.find((r) => r.id === openReportId);

  const sidebarView = view === "report" ? "reports" : view;
  const mobileTitle = view === "chat" ? (active?.title || "New analysis") : { conversations: "Conversations", datasets: "Datasets", reports: "Reports", report: "Report" }[view];

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <Sidebar
        mode={adapter.mode}
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
        {adapter.mode === "demo" && <DemoBanner onReset={resetDemo} />}
        <div className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="topbar-title">{mobileTitle}</div>
        </div>
        {view === "chat" && (
          <Workspace
            key={activeId || "new"}
            conversation={active}
            datasets={datasets}
            selectedDatasets={active ? active.datasetIds : draftDatasets}
            onDatasetsChange={setConversationDatasets}
            singleDataset={!!adapter.singleDataset}
            datasetsLoaded={datasetsLoaded}
            onOpenDatasets={adapter.canUpload ? () => navigate("datasets") : null}
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
        {view === "datasets" && (
          <DatasetsPage
            mode={adapter.mode}
            datasets={datasets}
            loaded={datasetsLoaded}
            loadError={datasetsError}
            onRetryLoad={refreshDatasets}
            onUpload={uploadDataset}
            onDelete={deleteDataset}
            onAnalyse={(id) => { newAnalysis(); setDraftDatasets([id]); }}
          />
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
