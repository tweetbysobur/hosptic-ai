// Form submit button. Disabled while pending, so a double click cannot send a second request.
export default function SubmitButton({ pending, pendingLabel, children, className = "" }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-ink shadow-[0_10px_24px_-12px_rgba(255,96,130,0.75)] transition duration-200 hover:bg-[#ff7596] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
