// Status message for forms and pages. Errors use role="alert" so they are announced immediately.
export default function Notice({ tone = "error", title, children }) {
  const styles = {
    error: "border-rose/40 bg-blush text-ink",
    info: "border-line bg-surface text-ink",
    success: "border-success/40 bg-surface text-ink",
  };
  const accent = { error: "bg-rose", info: "bg-muted", success: "bg-success" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${accent[tone]}`} />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}
