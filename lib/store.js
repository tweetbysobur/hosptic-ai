// Conversation and report persistence. Kept in browser storage for now; swap
// these functions for API calls to store conversations on the server.

const KEY_CONV = "hosptic.conversations.v1";
const KEY_REPORTS = "hosptic.reports.v1";

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: keep working in memory */
  }
}

// Each function takes an optional storage key, so different workspaces never share data.
export const loadConversations = (key = KEY_CONV) => read(key);
export const saveConversations = (c, key = KEY_CONV) => write(key, c);
export const loadReports = (key = KEY_REPORTS) => read(key);
export const saveReports = (r, key = KEY_REPORTS) => write(key, r);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function titleFrom(text) {
  const t = text.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  return t.length > 60 ? t.slice(0, 57).trimEnd() + "…" : t;
}

export function relativeTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function reportToMarkdown(report) {
  const lines = [`# ${report.title}`, "", `Dataset: ${report.dataset}  `, `Generated: ${new Date(report.created).toLocaleString()}`, ""];
  report.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.headline}`, "", `*Question: ${s.question}*`, "");
    (s.explanation || []).forEach((p) => lines.push(p, ""));
    (s.evidence || []).filter((e) => e.kind === "table").forEach((t) => {
      lines.push(`**${t.title}**`, "", `| ${t.columns.map((c) => c.label).join(" | ")} |`, `| ${t.columns.map((c) => (c.align === "right" ? "---:" : "---")).join(" | ")} |`);
      t.rows.forEach((r) => lines.push(`| ${t.columns.map((c) => r[c.key]).join(" | ")} |`));
      lines.push("");
    });
    if (s.interpretation?.length) {
      lines.push("**Interpretation**", "");
      s.interpretation.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    }
    if (s.technical) {
      lines.push("**Technical details**", "", `Method: ${s.technical.method}`, "");
      (s.technical.results || []).forEach((r) => lines.push(`- ${r.label}: ${r.value}`));
      if (s.technical.assumptions?.length) { lines.push("", "Assumptions:"); s.technical.assumptions.forEach((a) => lines.push(`- ${a}`)); }
      if (s.technical.limitations?.length) { lines.push("", "Limitations:"); s.technical.limitations.forEach((a) => lines.push(`- ${a}`)); }
      lines.push("");
    }
  });
  return lines.join("\n");
}

export function downloadText(filename, text, type = "text/markdown") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
