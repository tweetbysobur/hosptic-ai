// Hosptic mark: two red uprights crossed by a pulse line, drawn from the brand logo.
export default function Logo({ className, size, title }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="8" fill="#0c0a09" />
      <rect x="8.5" y="7" width="4.2" height="18" rx="2.1" fill="#ff1f45" />
      <rect x="19.3" y="7" width="4.2" height="18" rx="2.1" fill="#ff1f45" />
      <path d="M4 17.2h7.2l1.6 2.2 2.4-6.6 2.6 8.4 1.9-4.8H28" fill="none" stroke="#0c0a09" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
