"use client";

import { ChevronDown, FlaskConical, ArrowUpRight, FileText, Download } from "lucide-react";
import Chart from "./Chart";
import Logo from "./Logo";

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

export default function Response({ response, onAsk, onOpenReport, onDownloadReport }) {
  const r = response;
  return (
    <article className="resp" aria-label="Analysis">
      <div className="resp-meta">
        <Logo className="mark" />
        <span>Hosptic</span>
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
            <div className="report-meta">{[r.report.pdf ? "PDF report" : `${r.report.sections.length} sections`, r.report.dataset].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn" onClick={() => onDownloadReport?.(r.report)}><Download size={14} /> Download</button>
          {!r.report.pdf && <button className="btn primary" onClick={() => onOpenReport?.(r.report)}>Open</button>}
        </div>
      )}

      {/* Layer 3: supporting evidence */}
      {r.evidence?.length > 0 && (
        <section>
          <div className="layer-label">Evidence</div>
          <Evidence items={r.evidence} />
        </section>
      )}

      {/* Layer 4: interpretation */}
      {r.interpretation?.length > 0 && (
        <section>
          <div className="layer-label">What this means</div>
          <ul className="interp">{r.interpretation.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      {/* Layer 5: technical details */}
      <Technical technical={r.technical} />

      {/* Layer 6: follow-up suggestions */}
      {r.followUps?.length > 0 && (
        <section>
          <div className="layer-label">Explore next</div>
          <div className="followups">
            {r.followUps.map((f) => (
              <button key={f} className="chip" onClick={() => onAsk(f)}>
                {f} <ArrowUpRight size={13} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
