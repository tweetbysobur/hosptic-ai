"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import { ConversationsPage } from "./Pages";
import { ReportsLibrary, ReportDetail } from "./live/ReportsLibrary";
import { loadConversations, saveConversations, uid, titleFrom, downloadBlob } from "@/lib/store";
import { liveAdapter } from "@/lib/workspace/live-adapter";
import { useSession } from "./auth/SessionProvider";
import { ROLE_LABELS, permissionsFor, canDeleteDataset } from "@/lib/auth/session";
import LiveHome from "./live/LiveHome";
import UploadDialog from "./live/UploadDialog";
import DatasetDetail from "./live/DatasetDetail";
import Settings from "./settings/Settings";
import { ConfirmProvider, useConfirm } from "./ui/ConfirmDialog";

export default function AppShell(props) {
  return (
    <ConfirmProvider>
      <WorkspaceShell {...props} />
    </ConfirmProvider>
  );
}

const fileBase = (title) => String(title || "report").slice(0, 50).replace(/[^\w]+/g, "-").toLowerCase();

function WorkspaceShell({ adapter = liveAdapter }) {
  const confirm = useConfirm();
  const session = useSession();
  const permissions = permissionsFor(session?.role);

  const [ready, setReady] = useState(false);
  // Roles that cannot run analyses (viewers) start on Datasets and never see analysis controls.
  const [view, setView] = useState(permissions.runAnalyses ? "chat" : "datasets");
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [reports, setReports] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [openReportId, setOpenReportId] = useState(null);
  const [openDatasetId, setOpenDatasetId] = useState(null);
  const [openDatasetTab, setOpenDatasetTab] = useState("columns");
  const [datasets, setDatasets] = useState([]);
  const [datasetsStatus, setDatasetsStatus] = useState("loading");
  const [draftDatasets, setDraftDatasets] = useState([]);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const inFlight = useRef(false);

  // The organisation name can change in Settings; the session keeps the name from sign-in.
  const [orgName, setOrgName] = useState(null);
  const identity = session
    ? { name: orgName || session.organization.name, meta: ROLE_LABELS[session.role] || "Member", user: session.user.fullName, email: session.user.email }
    : adapter.identity;
  const storageKeys = adapter.storage;

  // Only ready datasets with column details can be analysed.
  const analysable = useMemo(() => datasets.filter((d) => Array.isArray(d.variables)), [datasets]);

  useEffect(() => {
    setConversations(loadConversations(storageKeys.conversations));
    try { setCollapsed(window.localStorage.getItem("hosptic.sidebar") === "collapsed"); } catch {}
    adapter.purgeLegacy?.();
    setReady(true);
  }, [adapter, storageKeys]);

  useEffect(() => { if (ready) saveConversations(conversations, storageKeys.conversations); }, [conversations, ready, storageKeys]);

  const loadDatasets = useCallback(() => {
    // A refresh keeps the current view, so an open upload dialog is not unmounted mid-flow.
    setDatasetsStatus((s) => (s === "loading" ? "loading" : "refreshing"));
    return adapter.listDatasets()
      .then((items) => { setDatasets(items); setDatasetsStatus("ready"); return items; })
      .catch(() => { setDatasets([]); setDatasetsStatus("error"); return []; });
  }, [adapter]);

  const [reportsStatus, setReportsStatus] = useState("loading");
  const loadReports = useCallback(() => adapter.listReports()
    .then((items) => { setReports(items); setReportsStatus("ready"); })
    .catch(() => setReportsStatus((s) => (s === "ready" ? "ready" : "error"))), [adapter]);

  useEffect(() => { loadDatasets(); loadReports(); }, [loadDatasets, loadReports]);

  // Start new analyses on the first dataset that can be analysed.
  useEffect(() => {
    if (!activeId && draftDatasets.length === 0 && analysable[0]) setDraftDatasets([analysable[0].id]);
  }, [activeId, draftDatasets.length, analysable]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try { window.localStorage.setItem("hosptic.sidebar", c ? "expanded" : "collapsed"); } catch {}
      return !c;
    });
  };

  const navigate = (v) => { setView(v); setDrawer(false); };

  const newAnalysis = useCallback((datasetId) => {
    if (!permissions.runAnalyses) return;
    setActiveId(null);
    setDraftDatasets(typeof datasetId === "string" ? [datasetId] : analysable[0] ? [analysable[0].id] : []);
    setView("chat");
    setDrawer(false);
    setError(null);
  }, [analysable, permissions.runAnalyses]);

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
      const response = await adapter.analyze({ message, datasetIds: conv.datasetIds, history, datasets: analysable });
      if (response.type === "report") loadReports();
      updateConversation(id, (c) => ({
        ...c,
        messages: [...c.messages, { id: uid(), role: "assistant", response, at: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      }));
    } catch (e) {
      setError({ conversationId: id, message: e.message || "Something went wrong", kind: e.kind || "failed", retry: message });
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

  // Creates the PDF report for one analysis and adds it to that conversation. Errors go back to the
  // caller, so the button can say what went wrong next to the analysis it belongs to.
  const createReport = async (conversationId, analysis) => {
    const response = await adapter.createReport(analysis);
    loadReports();
    updateConversation(conversationId, (c) => ({
      ...c,
      messages: [...c.messages, { id: uid(), role: "assistant", response, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    }));
    return response.report;
  };

  const downloadReport = async (report) => {
    try {
      const { blob, fileName } = await adapter.downloadReport(report);
      downloadBlob(fileName || `${fileBase(report.title)}.pdf`, blob);
    } catch (e) {
      setNotice(`The report could not be downloaded. ${e.message || ""}`.trim());
    }
  };
  // Download that reports errors to its caller, so the Reports page can show them next to the report.
  const fetchReport = async (report) => {
    const { blob, fileName } = await adapter.downloadReport(report);
    downloadBlob(fileName || `${fileBase(report.title)}.pdf`, blob);
  };
  // Conversations live on this device; an analysis can be opened only if its conversation is here.
  const findConversation = useCallback((analysisId) => {
    if (!analysisId) return null;
    const c = conversations.find((cv) => cv.messages?.some((m) => m.response?.analysisId === analysisId));
    return c ? { id: c.id, title: c.title, open: () => openConversation(c.id) } : null;
  }, [conversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opens the report page, which shows the PDF in place.
  const openReport = (report) => { setOpenReportId(report.id); setView("report"); setDrawer(false); };
  const datasetName = useCallback((id) => (id ? datasets.find((d) => d.id === id)?.name || "Deleted dataset" : ""), [datasets]);

  const deleteDataset = async (dataset) => {
    const ok = await confirm({
      title: `Delete ${dataset.name}?`,
      body: "The file is removed for everyone in your organisation. Analyses and reports made from it stay readable.",
      confirmLabel: "Delete dataset",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await adapter.deleteDataset(dataset.id);
      setDraftDatasets((ids) => ids.filter((x) => x !== dataset.id));
      if (openDatasetId === dataset.id) { setOpenDatasetId(null); setView("datasets"); }
      await loadDatasets();
    } catch (e) {
      setNotice(e.message || "The dataset could not be deleted");
    }
  };

  const openedReport = reports.find((r) => r.id === openReportId);
  const sidebarView = view === "report" ? "reports" : view === "dataset" ? "datasets" : view;
  const mobileTitle = view === "chat" ? (active?.title || "New analysis") : { conversations: "Conversations", datasets: "Datasets", dataset: "Dataset", reports: "Reports", report: "Report", settings: "Settings" }[view];
  const noData = datasetsStatus !== "loading" && analysable.length === 0;

  const liveHome = (
    <LiveHome
      datasets={datasets}
      status={datasetsStatus}
      onRetry={loadDatasets}
      canUpload={permissions.uploadDatasets}
      canDelete={(d) => canDeleteDataset(session, d)}
      canPreview={permissions.previewRows}
      onUpload={() => setUploadOpen(true)}
      onAnalyse={permissions.runAnalyses ? (id) => newAnalysis(id) : null}
      onDelete={deleteDataset}
      onOpen={(id, tab = "columns") => { setOpenDatasetId(id); setOpenDatasetTab(tab); setView("dataset"); }}
    />
  );

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${drawer ? "drawer-open" : ""}`}>
      <Sidebar
        mode={adapter.mode}
        canAnalyse={permissions.runAnalyses}
        workspace={identity}
        view={sidebarView}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onNavigate={navigate}
        onNew={() => newAnalysis()}
        conversations={conversations}
        activeId={activeId}
        onOpenConversation={openConversation}
        counts={{}}
        onCloseDrawer={() => setDrawer(false)}
      />
      <div className="scrim" onClick={() => setDrawer(false)} />
      <main className="main">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="topbar-title">{mobileTitle}</div>
        </div>
        {notice && (
          <div className="notice app-notice" role="alert">
            <div className="notice-body"><div className="notice-text">{notice}</div></div>
            <button type="button" className="btn" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        {view === "chat" && (noData && !active ? liveHome : (
          <Workspace
            key={activeId || "new"}
            conversation={active}
            datasets={analysable}
            selectedDatasets={active ? active.datasetIds : draftDatasets}
            onDatasetsChange={setConversationDatasets}
            singleDataset={!!adapter.singleDataset}
            datasetsLoaded={datasetsStatus !== "loading"}
            onOpenDatasets={() => navigate("datasets")}
            onAsk={ask}
            pending={pending && pending.conversationId === active?.id ? pending : null}
            error={error && error.conversationId === active?.id ? error : null}
            onRetry={retry}
            onRename={(t) => active && renameConversation(active.id, t)}
            onDelete={() => active && deleteConversation(active.id)}
            onOpenReport={openReport}
            onDownloadReport={downloadReport}
            onCreateReport={adapter.createReport && permissions.generateReports !== false && active ? (analysis) => createReport(active.id, analysis) : null}
            reports={reports}
            ready={ready}
          />
        ))}
        {view === "datasets" && liveHome}
        {view === "dataset" && openDatasetId && (
          <DatasetDetail
            key={`${openDatasetId}-${openDatasetTab}`}
            datasetId={openDatasetId}
            initialTab={openDatasetTab}
            adapter={adapter}
            permissions={permissions}
            onBack={() => setView("datasets")}
            onAnalyse={permissions.runAnalyses ? (id) => newAnalysis(id) : null}
            onDelete={deleteDataset}
            canDelete={(d) => canDeleteDataset(session, d)}
          />
        )}
        {view === "conversations" && (
          <ConversationsPage conversations={conversations} onOpen={openConversation} onRename={renameConversation} onDelete={deleteConversation} onNew={() => newAnalysis()} />
        )}
        {view === "reports" && (
          <ReportsLibrary
            reports={reports}
            status={reportsStatus}
            onRetry={loadReports}
            datasetName={datasetName}
            onOpen={openReport}
            onDownload={fetchReport}
            onOpenDataset={(id) => { setOpenDatasetId(id); setOpenDatasetTab("columns"); setView("dataset"); }}
            findConversation={findConversation}
            onNewAnalysis={permissions.runAnalyses ? () => newAnalysis() : null}
          />
        )}
        {view === "report" && openedReport && (
          <ReportDetail
            key={openedReport.id}
            report={openedReport}
            adapter={adapter}
            datasetName={datasetName}
            onBack={() => setView("reports")}
            onDownload={fetchReport}
            onOpenDataset={(id) => { setOpenDatasetId(id); setOpenDatasetTab("columns"); setView("dataset"); }}
            conversation={findConversation(openedReport.analysisId)}
          />
        )}
        {view === "settings" && (
          <Settings
            adapter={adapter}
            session={session ? { ...session, organization: { ...session.organization, name: orgName || session.organization.name } } : null}
            permissions={permissions}
            onOrganizationRenamed={setOrgName}
          />
        )}
      </main>
      {/* Owned by the shell, so it stays open when a first upload switches the workspace to analysis. */}
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} upload={(form) => adapter.uploadDataset(form)} onUploaded={loadDatasets} />
    </div>
  );
}
