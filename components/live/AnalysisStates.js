"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, PenLine, Database, LogIn } from "lucide-react";

// What the backend does for every question. Shown as the plan while the request runs; the backend
// reports no live progress, so no step is marked as finished.
const STEPS = [
  "Choosing a method from your question and the column types",
  "Computing the statistics on your data",
  "Writing a plain-language explanation and checking it against the numbers",
];

export function AnalysisProgress({ datasetName }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="progress-card" role="status" aria-live="polite">
      <div className="progress-head">
        <span className="pulse" aria-hidden="true"><span /><span /><span /></span>
        <span className="progress-title">Analysing {datasetName}</span>
        <span className="progress-time tnum">{seconds}s</span>
      </div>
      <ol className="progress-steps">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <p className="progress-note">{seconds < 45 ? "Most answers take under a minute." : "Still working. Larger datasets and harder questions take longer."}</p>
    </div>
  );
}

const STATES = {
  invalid: { title: "This question needs a little more detail", action: "rephrase" },
  unsupported: { title: "This question can’t be answered with this dataset", action: "suggest" },
  missing: { title: "The dataset isn’t available", action: "dataset" },
  session: { title: "Your session has ended", action: "signin" },
  forbidden: { title: "Your role can’t run this", action: null },
  rate: { title: "Too many requests", action: "retry" },
  timeout: { title: "The analysis took too long", action: "retry" },
  network: { title: "The Hosptic service couldn’t be reached", action: "retry" },
  failed: { title: "This analysis couldn’t be completed", action: "retry" },
};

export function AnalysisError({ error, onRetry, onRephrase, onChooseDataset, suggestions = [], onAsk }) {
  const state = STATES[error.kind] || STATES.failed;
  return (
    <div className="notice analysis-error" role="alert">
      <div className="notice-body">
        <div className="notice-title">{state.title}</div>
        <div className="notice-text">{error.message}.</div>
        {state.action === "suggest" && suggestions.length > 0 && (
          <div className="followups error-suggestions">
            {suggestions.map((q) => <button key={q} type="button" className="chip" onClick={() => onAsk(q)}>{q}</button>)}
          </div>
        )}
      </div>
      <div className="notice-actions">
        {state.action === "retry" && <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Try again</button>}
        {(state.action === "rephrase" || state.action === "suggest") && <button type="button" className="btn" onClick={onRephrase}><PenLine size={14} /> Rephrase</button>}
        {state.action === "dataset" && <button type="button" className="btn" onClick={onChooseDataset}><Database size={14} /> Choose a dataset</button>}
        {state.action === "signin" && <Link className="btn primary" href="/login?reason=expired&next=%2Fapp"><LogIn size={14} /> Sign in again</Link>}
      </div>
    </div>
  );
}
