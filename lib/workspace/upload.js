// Client-side checks before a dataset upload. They mirror the documented backend rules
// (CSV or XLSX, MAX_UPLOAD_MB default 10). The backend validates the content again.

// Defaults to 10 MB. Set NEXT_PUBLIC_UPLOAD_MAX_MB to match the host: Vercel functions accept
// request bodies up to 4.5 MB, so a backend on Vercel needs 4.
const configured = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_MB);
export const UPLOAD_MAX_MB = Number.isFinite(configured) && configured > 0 ? configured : 10;
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

export function validateUploadFile(file, maxMb = UPLOAD_MAX_MB) {
  if (!file) return "Choose a CSV or Excel file to upload.";
  const name = String(file.name ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return "Upload a CSV (.csv) or Excel (.xlsx) file.";
  if (!(file.size > 0)) return "This file is empty.";
  if (file.size > maxMb * 1024 * 1024) return `Files can be up to ${maxMb} MB.`;
  return null;
}

export function validateDatasetName(value) {
  const name = String(value ?? "").trim();
  if (name.length > 160) return "Dataset name must be 160 characters or fewer.";
  return null;
}

// Summarises the quality report returned with an upload: counts by severity, in backend order.
export function summariseQuality(quality) {
  const issues = Array.isArray(quality?.issues) ? quality.issues : [];
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const issue of issues) if (counts[issue?.severity] !== undefined) counts[issue.severity] += 1;
  return { counts, issues };
}
