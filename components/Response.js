"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical, FileText, Download, FilePlus2, Loader2 } from "lucide-react";
import Chart from "./Chart";

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
            <dl className="stat-strip" key={i}>
              {e.items.map((s) => (
                <div className="stat-cell" key={s.label}>
                  <dt>{s.label}</dt>
                  <dd className="tnum">{s.value}</dd>
                </div>
              ))}
            </dl>
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

export default function Response({ response, onAsk, onOpenReport, onDownloadReport, onCreateReport = null, existingReport = null, showDataset = true }) {
  const r = response;
  // A report confirmation is one row: what was made and how to get it.
  if (r.type === "report" && r.report) {
    return (
      <div className="report-row" role="status" aria-label="PDF report ready">
        <FileText size={18} strokeWidth={1.6} className="report-row-icon" />
        <div className="report-row-text">
          <div className="report-row-title">{r.report.title}</div>
          <div className="report-row-meta">PDF report saved under Reports</div>
        </div>
        <button type="button" className="btn" onClick={() => onDownloadReport?.(r.report)}><Download size={14} /> Download</button>
      </div>
    );
  }
  return (
    <article className="resp" aria-label="Analysis">
      {showDataset && r.dataset && (
        <div className="resp-meta"><span className="ds">{r.dataset.name}</span></div>
      )}

      {/* Layer 1: main finding */}
      <h2 className="resp-headline">{r.headline}</h2>

      {/* Layer 2: plain-language explanation */}
      <div className="resp-explain">
        {(r.explanation || []).map((p, i) => <p key={i}>{p}</p>)}
      </div>


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
