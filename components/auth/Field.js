// Labelled input with an accessible error message. The error is linked with aria-describedby
// and the field is marked aria-invalid, so screen readers announce the problem.
export default function Field({ id, label, error, hint, type = "text", autoComplete, value, onChange, disabled, maxLength, required = true }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {!required && <span className="font-medium text-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={maxLength}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted transition duration-150 focus:border-rose focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-60 aria-invalid:border-rose"
      />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-rose">{error}</p>}
    </div>
  );
}
