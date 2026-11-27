"use client";

import { useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { messageForError } from "@/lib/auth/messages";
import { fileSizeLabel, plural } from "@/lib/format";
import { UPLOAD_MAX_MB, validateUploadFile, validateDatasetName, summariseQuality } from "@/lib/workspace/upload";

// Uploads a CSV or XLSX file to POST /api/v1/datasets/upload and shows the quality report the
// backend returns. Nothing is shown as uploaded until the backend confirms it.
export default function UploadDialog({ open, onClose, onUploaded, upload }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);

  const reset = () => { setFile(null); setName(""); setDescription(""); setError(null); setPending(false); setResult(null); inFlight.current = false; };
  const close = () => { if (pending) return; reset(); onClose(); };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = validateUploadFile(file) || validateDatasetName(name);
    setError(problem);
    if (problem) return;
    inFlight.current = true;
    setPending(true);
    const form = new FormData();
    form.append("file", file);
    if (name.trim()) form.append("name", name.trim());
    if (description.trim()) form.append("description", description.trim().slice(0, 1000));
    try {
      const dataset = await upload(form);
      setResult(dataset);
      onUploaded?.(dataset);
    } catch (e) {
      setError(e?.status === 413 ? `This file is larger than the upload limit.` : messageForError(e));
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  };

  const quality = result ? summariseQuality(result.quality) : null;

  return (
    <Modal open={open} onClose={close} labelledBy="upload-title" width={520} busy={pending}>
      {!result ? (
        <form onSubmit={submit} noValidate>
          <h2 id="upload-title" className="modal-title">Upload a dataset</h2>
          <p className="modal-body">CSV or Excel (.xlsx), up to {UPLOAD_MAX_MB} MB. The file is stored privately for your organisation, and every column is profiled for data quality.</p>

          <label className="upload-drop">
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
              disabled={pending}
              aria-describedby={error ? "upload-error" : undefined}
            />
            <span className="upload-drop-title">{file ? file.name : "Choose a file"}</span>
            <span className="upload-drop-meta">{file ? fileSizeLabel(file.size) : "CSV or XLSX"}</span>
          </label>

          <label className="field-label" htmlFor="dataset-name">Name <span>(optional)</span></label>
          <input id="dataset-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} disabled={pending} placeholder="Uses the file name if left empty" />

          <label className="field-label" htmlFor="dataset-description">Description <span>(optional)</span></label>
          <textarea id="dataset-description" className="field-input field-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} disabled={pending} placeholder="What the data covers, for example the period and the wards" />

          {error && <p id="upload-error" className="field-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={close} disabled={pending}>Cancel</button>
            <button type="submit" className="btn primary" disabled={pending}>{pending ? "Uploading and profiling…" : "Upload"}</button>
          </div>
        </form>
      ) : (
        <div>
          <h2 id="upload-title" className="modal-title">{result.name} is ready</h2>
          <p className="modal-body">
            {plural(result.rowCount ?? 0, "row", "rows")} and {plural(result.columnCount ?? 0, "column", "columns")} profiled.
            {" "}
            {quality.issues.length === 0
              ? "No data quality issues were found."
              : `${plural(quality.issues.length, "quality note", "quality notes")}: ${quality.counts.critical} critical, ${quality.counts.warning} warnings, ${quality.counts.info} informational.`}
          </p>
          {quality.issues.length > 0 && (
            <ul className="upload-issues">
              {quality.issues.slice(0, 4).map((issue, i) => (
                <li key={i} data-severity={issue.severity}>{issue.message}</li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button type="button" className="btn primary" data-autofocus onClick={close}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
