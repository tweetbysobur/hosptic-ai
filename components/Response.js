"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical, FileText, Download, FilePlus2, Loader2 } from "lucide-react";
import Chart from "./Chart";
import { plural } from "@/lib/format";

export function Evidence({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="evidence">
      {items.map((e, i) => {
        if (e.kind === "chart")
          return (
            <figure className="card chart-card" key={i} style={{ margin: 0 }}>
              <div className="chart-head"><div className="chart-title">{e.title}</div></div>
              <div className="chart-wrap"><Chart chart={e.chart} /></div>
              {e.caption && <figcaption className="chart-caption">{e.caption}</figcaption>}
            </figure>
          );
        if (e.kind === "table")
          return (
            <div className="card table-card" key={i}>
              {e.title && <div className="table-title">{e.title}</div>}
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>{e.columns.map((c) => <th key={c.key} className={c.align === "right" ? "r" : ""}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {e.rows.map((r, j) => (
                      <tr key={j} className={r._highlight ? "hl" : ""}>
                        {e.columns.map((c) => <td key={c.key} className={c.align === "right" ? "r" : ""}>{r[c.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        if (e.kind === "stats")
          return (
            <div className="stats-row" key={i}>
              {e.items.map((s) => (
                <div className="card stat" key={s.label}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                </div>
              ))}
            </div>
          );
        return null;
      })}
    </div>
  );
}

export function Technical({ technical, defaultOpen = false }) {
  if (!technical) return null;
  return (
    <details className="tech" open={defaultOpen}>
      <summary>
        <FlaskConical size={15} strokeWidth={1.75} />
        Technical details
        <ChevronDown size={16} className="chev" />
      </summary>
      <div className="tech-body">
        <p className="tech-method"><strong>Method.</strong> {technical.method}</p>
        {technical.results?.length > 0 && (
          <dl className="tech-grid">
            {technical.results.map((r) => (
              <FragmentPair key={r.label} dt={r.label} dd={r.value} />
            ))}
          </dl>
        )}
        {technical.assumptions?.length > 0 && (
          <div><h4>Assumptions</h4><ul>{technical.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
        )}
        {technical.limitations?.length > 0 && (
          <div><h4>Limitations</h4><ul>{technical.limitations.map((a) => <li key={a}>{a}</li>)}</ul></div>
        )}
      </div>
    </details>
  );
}

function FragmentPair({ dt, dd }) {
  return (<><dt>{dt}</dt><dd>{dd}</dd></>);
}

// One PDF report per analysis. Uses an existing report when the organisation already made one.
function ReportAction({ response, existing, onCreate, onDownload }) {
  const [state, setState] = useState({ status: "idle", report: null, message: "" });
  const report = state.report || existing;
  if (report) {
    return (
      <div className="report-action">
        <span className="report-action-text"><FileText size={15} strokeWidth={1.75} /> PDF report saved under Reports</span>
        <button type="button" className="btn" onClick={() => onDownload?.(report)}><Download size={14} /> Download</button>
      </div>
    );
  }
  if (!onCreate) return null;
  const create = async () => {
    setState({ status: "creating", report: null, message: "" });
    try {
      const r = await onCreate(response);
      setState({ status: "done", report: r, message: "" });
    } catch (e) {
      setState({ status: "error", report: null, message: e.message || "The report could not be generated" });
    }
  };
  return (
    <div className="report-action">
      <button type="button" className="btn" onClick={create} disabled={state.status === "creating"}>
        {state.status === "creating" ? <Loader2 size={14} className="spin" /> : <FilePlus2 size={14} />}
        {state.status === "creating" ? "Creating PDF report…" : "Create PDF report"}
      </button>
      {state.status === "error" && <span className="report-action-error" role="alert">{state.message}.</span>}
    </div>
  );
}

export default function Response({ response, onAsk, onOpenReport, onDownloadReport, onCreateReport = null, existingReport = null }) {
  const r = response;
  return (
    <article className="resp" aria-label="Analysis">
      <div className="resp-meta">
        {r.dataset && <span className="ds">{r.dataset.name}</span>}
      </div>

      {/* Layer 1: main finding */}
      <h2 className="resp-headline">{r.headline}</h2>

      {/* Layer 2: plain-language explanation */}
      <div className="resp-explain">
        {(r.explanation || []).map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {r.type === "report" && r.report && (
        <div className="card report-card">
          <div className="doc-icon"><FileText size={20} strokeWidth={1.5} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="report-title">{r.report.title}</div>
            <div className="report-meta">{[r.report.pdf ? "PDF report" : plural(r.report.sections.length, "section", "sections"), r.report.dataset].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn" onClick={() => onDownloadReport?.(r.report)}><Download size={14} /> Download</button>
          {!r.report.pdf && <button className="btn primary" onClick={() => onOpenReport?.(r.report)}>Open</button>}
        </div>
      )}

      {/* Layer 3: supporting evidence */}
      {r.evidence?.length > 0 && (
        <section>
          <Evidence items={r.evidence} />
        </section>
      )}

      {/* Layer 4: interpretation */}
      {r.interpretation?.length > 0 && (
        <section>
          <h3 className="layer-heading">What this means</h3>
          <ul className="interp">{r.interpretation.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      {/* Layer 5: technical details */}
      <Technical technical={r.technical} />

      {r.type === "analysis" && r.analysisId && (
        <ReportAction response={r} existing={existingReport} onCreate={onCreateReport} onDownload={onDownloadReport} />
      )}

      {/* Layer 6: follow-up suggestions */}
      {r.followUps?.length > 0 && (
        <section>
          <h3 className="layer-heading">Ask next</h3>
          <div className="followups">
            {r.followUps.map((f) => (
              <button key={f} className="chip" onClick={() => onAsk(f)}>
                {f}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
