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



export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
