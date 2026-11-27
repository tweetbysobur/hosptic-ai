"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Plus, X, Check, Variable, Pencil, Trash2, ChartNoAxesColumn, TrendingUp, Search, GitCompareArrows, ChartScatter, Database, ShieldCheck } from "lucide-react";
import { AnalysisProgress, AnalysisError } from "./live/AnalysisStates";
import Response from "./Response";
import { useConfirm } from "./ui/ConfirmDialog";
import { titleFrom } from "@/lib/store";

// Starter questions come from each dataset's own columns (lib/workspace/live-mapping.js).
const STARTER_ICONS = { compare: GitCompareArrows, distribution: ChartNoAxesColumn, trend: TrendingUp, drivers: Search, relationship: ChartScatter };

const TYPE_SHORT = { numeric: "123", binary: "y/n", categorical: "abc", date: "date", text: "txt" };

export default function Workspace({ conversation, datasets, selectedDatasets, onDatasetsChange, onAsk, pending, error, onRetry, onRename, onDelete, onOpenReport, onDownloadReport, onCreateReport = null, reports = [], ready, preview = false, singleDataset = false, datasetsLoaded = true, onOpenDatasets = null }) {
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const taRef = useRef(null);
  const threadRef = useRef(null);
  const pickerRef = useRef(null);

  const messages = conversation?.messages || [];
  const dsById = useMemo(() => Object.fromEntries(datasets.map((d) => [d.id, d])), [datasets]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  useEffect(() => {
    if (preview) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, preview]);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  const submit = (q) => {
    const value = (q ?? text).trim();
    if (preview || !value || pending) return;
    if (!selectedDatasets.length) { setPickerOpen(true); return; }
    onAsk(value);
    if (q === undefined) setText("");
  };

  const insertVariable = (label) => {
    setText((t) => (t && !t.endsWith(" ") ? `${t} ${label.toLowerCase()}` : `${t}${label.toLowerCase()}`));
    taRef.current?.focus();
  };

  const toggleDataset = (id) => {
    const on = selectedDatasets.includes(id);
    const next = on ? selectedDatasets.filter((x) => x !== id) : singleDataset ? [id] : [...selectedDatasets, id];
    onDatasetsChange(next);
    if (singleDataset && !on) setPickerOpen(false);
  };

  const primaryDs = selectedDatasets[0] || null;
  const primary = dsById[primaryDs] || null;
  const starters = (primary?.starters || []).map((st) => ({ ...st, icon: STARTER_ICONS[st.icon] || Search }));
  // Next questions: the dataset's own column-based questions that have not been asked yet.
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.text.trim().toLowerCase()));
  const nextQuestions = starters.map((st) => st.q).filter((q) => !asked.has(q.toLowerCase())).slice(0, 3);
  const lastAnalysisId = [...messages].reverse().find((m) => m.role === "assistant" && m.response?.type === "analysis")?.id;
  // The dataset chip shows on the first answer and whenever the dataset changes, not on every answer.
  const showDatasetFor = new Set();
  {
    let prev = null;
    for (const m of messages) {
      if (m.role !== "assistant" || m.response?.type !== "analysis") continue;
      const id = m.response.dataset?.id || null;
      if (id !== prev) showDatasetFor.add(m.id);
      prev = id;
    }
  }
  const [scrolled, setScrolled] = useState(false);
  const reportFor = (analysisId) => reports.find((r) => r.analysisId === analysisId) || null;

  const composer = (
    <div className="composer-wrap">
      <div className="composer" ref={pickerRef}>
        {pickerOpen && (
          <div className="popover" role="dialog" aria-label="Choose datasets">
            <div className="popover-label">{singleDataset ? "Choose a dataset" : "Choose datasets"}</div>
            {datasets.map((d) => {
              const on = selectedDatasets.includes(d.id);
              return (
                <button key={d.id} className="ds-option" onClick={() => toggleDataset(d.id)} aria-pressed={on}>
                  <span className={`check ${on ? "on" : ""}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                  <span>
                    <div className="ds-option-name">{d.name}</div>
                    <div className="ds-option-meta tnum">{d.rows.toLocaleString()} {d.unit} · {d.variables.length} variables</div>
                  </span>
                </button>
              );
            })}
            {datasets.length === 0 && <div className="sb-empty">{datasetsLoaded ? "No datasets yet." : "Loading datasets…"}</div>}
            {onOpenDatasets && <button className="ds-option" onClick={() => { setPickerOpen(false); onOpenDatasets(); }}><span className="check"><Plus size={12} /></span><span><div className="ds-option-name">Upload a dataset</div></span></button>}
          </div>
        )}
        <label htmlFor="ask" className="sr-only">Ask a question about your data</label>
        <textarea
          id="ask"
          ref={taRef}
          rows={1}
          value={text}
          placeholder={messages.length ? "Ask a follow-up question…" : "Ask a question about your hospital data…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
          autoFocus={!preview}
          readOnly={preview}
        />
        <div className="composer-bar">
          {selectedDatasets.map((id) => (
            <span className="ds-chip" key={id}>
              <span className="ds-chip-name">{dsById[id]?.name || id}</span>
              <button onClick={() => toggleDataset(id)} aria-label={`Remove ${dsById[id]?.name || id}`}><X size={12} /></button>
            </span>
          ))}
          <button className="add-ds" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen}>
            <Plus size={13} /> {selectedDatasets.length ? "Dataset" : "Choose a dataset"}
          </button>
          <button className="btn ghost" style={{ height: 28, fontSize: 12.5 }} onClick={() => setVarsOpen((o) => !o)} aria-pressed={varsOpen}>
            <Variable size={14} /> <span className="hide-sm">Variables</span>
          </button>
          <button className="send" onClick={() => submit()} disabled={preview || !text.trim() || !!pending} aria-label="Send question">
            <ArrowUp size={17} strokeWidth={2.25} />
          </button>
        </div>
      </div>
      {messages.length > 0 && primary && (
        <p className={`composer-note ${scrolled ? "is-hidden" : ""}`}>Each question is analysed on its own against {primary.name}. Name the columns you mean in follow-ups.</p>
      )}
    </div>
  );

  return (
    <div className="ws">
      <div className="ws-col">
        {conversation && (
          <header className="ws-head desktop-only">
            <div className="ws-title">
              {editing ? (
                <input
                  autoFocus
                  value={titleDraft}
                  aria-label="Conversation title"
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => { onRename(titleDraft); setEditing(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onRename(titleDraft); setEditing(false); }
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
              ) : (
                <span className="ws-title-text" title={conversation.title}>{conversation.title}</span>
              )}
            </div>
            <div className="ws-actions">
              <button className="icon-btn" onClick={() => { setTitleDraft(conversation.title); setEditing(true); }} aria-label="Rename conversation" title="Rename"><Pencil size={15} strokeWidth={1.75} /></button>
              <button className="icon-btn" onClick={async () => { if (await confirm({ title: "Delete this conversation?", body: "Its analyses are removed from this device. This cannot be undone.", confirmLabel: "Delete", tone: "danger" })) onDelete(); }} aria-label="Delete conversation" title="Delete"><Trash2 size={15} strokeWidth={1.75} /></button>
            </div>
          </header>
        )}

        {messages.length === 0 && !pending ? (
          <div className="empty">
            <div className="empty-inner">
              <h1>What would you like to understand from your data?</h1>
              <p className="lead">
                Ask in plain language. Hosptic runs the analysis, explains what it found and shows the evidence, with full statistical detail when you need it.
              </p>
              {primary && <DatasetContext dataset={primary} onChange={() => setPickerOpen(true)} canChange={datasets.length > 1} />}
              {starters.length > 0 && <div className="starter-label">Suggested for this dataset</div>}
              <div className="starter-grid">
                {starters.map((s) => (
                  <button key={s.q} className="starter" onClick={() => submit(s.q)} disabled={!ready}>
                    <span className="starter-kind"><s.icon size={13} strokeWidth={1.75} /> {s.kind}</span>
                    <span className="starter-q">{s.q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="thread" ref={threadRef} onScroll={(e) => { const s = e.currentTarget; setScrolled(s.scrollHeight - s.scrollTop - s.clientHeight > 80); }}>
            <div className="thread-inner">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  // The first question is already the conversation title in the header.
                  i === 0 && conversation && titleFrom(m.text) === conversation.title ? null : (
                    <Fragment key={m.id}>
                      {i > 0 && <hr className="turn-divider" aria-hidden="true" />}
                      <div className="msg-user">{m.text}</div>
                    </Fragment>
                  )
                ) : (
                  <Response
                    key={m.id}
                    response={m.id === lastAnalysisId && !pending ? { ...m.response, followUps: nextQuestions } : m.response}
                    onAsk={(q) => submit(q)}
                    onOpenReport={onOpenReport}
                    onDownloadReport={onDownloadReport}
                    onCreateReport={onCreateReport}
                    existingReport={m.response?.analysisId ? reportFor(m.response.analysisId) : null}
                    showDataset={showDatasetFor.has(m.id)}
                  />
                )
              )}
              {pending && <AnalysisProgress datasetName={pending.datasetIds.map((id) => dsById[id]?.name || id).join(" and ")} />}
              {error && (
                <AnalysisError
                  error={error}
                  datasetName={primary?.name}
                  onRetry={onRetry}
                  onRephrase={() => taRef.current?.focus()}
                  onChooseDataset={() => setPickerOpen(true)}
                  suggestions={nextQuestions}
                  onAsk={(q) => submit(q)}
                />
              )}
            </div>
          </div>
        )}
        {composer}
      </div>

      {varsOpen && (
        <VariablePanel datasets={selectedDatasets.map((id) => dsById[id]).filter(Boolean)} onPick={insertVariable} onClose={() => setVarsOpen(false)} />
      )}
    </div>
  );
}

const TYPE_LABEL = { numeric: "Number", binary: "Yes / no", categorical: "Category", date: "Date", text: "Text" };

// What the selected dataset holds, shown before the first question so suggestions make sense.
function DatasetContext({ dataset, onChange, canChange }) {
  const vars = dataset.variables || [];
  const shown = vars.slice(0, 10);
  const hidden = (dataset.sensitiveColumns || []).length;
  return (
    <section className="ds-context" aria-label="Selected dataset">
      <div className="ds-context-head">
        <span className="ds-context-icon"><Database size={16} strokeWidth={1.75} /></span>
        <div className="ds-context-title">
          <div className="ds-context-name">{dataset.name}</div>
          <div className="ds-context-meta tnum">
            {dataset.rows.toLocaleString()} rows · {vars.length} {vars.length === 1 ? "column" : "columns"} you can ask about{dataset.fileType ? ` · ${dataset.fileType}` : ""}
          </div>
        </div>
        {canChange && <button type="button" className="btn ghost ds-context-change" onClick={onChange}>Change</button>}
      </div>
      <ul className="ds-context-cols">
        {shown.map((v) => (
          <li key={v.key} title={v.missing ? `${v.missing} missing values` : undefined}>
            <span className="col-name">{v.label}</span>
            <span className="col-type">{TYPE_LABEL[v.type] || v.type}</span>
          </li>
        ))}
        {vars.length > shown.length && <li className="col-more">+{vars.length - shown.length} more</li>}
      </ul>
      {hidden > 0 && (
        <p className="ds-context-note"><ShieldCheck size={13} strokeWidth={1.75} /> {hidden} {hidden === 1 ? "column looks" : "columns look"} like personal data and {hidden === 1 ? "is" : "are"} excluded from analysis.</p>
      )}
    </section>
  );
}

function VariablePanel({ datasets, onPick, onClose }) {
  const [q, setQ] = useState("");
  return (
    <aside className="var-panel" aria-label="Variables">
      <div className="var-head">
        <h3>Variables</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close variables"><X size={16} /></button>
      </div>
      <input className="var-search" placeholder="Search variables" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search variables" />
      <div className="var-list">
        {datasets.length === 0 && <div className="sb-empty">Choose a dataset to see its variables.</div>}
        {datasets.map((d) => {
          const vars = d.variables.filter((v) => v.type !== "date" && v.label.toLowerCase().includes(q.toLowerCase()));
          return (
            <div key={d.id}>
              <div className="var-group">{d.name}</div>
              {vars.map((v) => (
                <button key={v.key} className="var-item" onClick={() => onPick(v.label)} title={v.levels ? v.levels.join(", ") : v.unit || ""}>
                  <span className="var-type">{TYPE_SHORT[v.type]}</span>
                  <span>{v.label}{v.unit ? <span style={{ color: "var(--ink-3)" }}> · {v.unit}</span> : null}</span>
                  {v.missing > 0 && <span className="miss tnum">{v.missing} missing</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
