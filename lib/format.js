// Small text helpers shared by the workspace.

export function plural(count, one, many) {
  return `${Number(count).toLocaleString()} ${count === 1 ? one : many}`;
}

// Two-letter initials from an organisation or workspace name, ignoring short joining words.
export function initialsFrom(name) {
  const words = String(name ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !["the", "of", "and", "for"].includes(w.toLowerCase()));
  if (!words.length) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

export function fileSizeLabel(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
