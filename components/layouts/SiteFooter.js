import Link from "next/link";
import Logo from "@/components/Logo";
import { FOOTER_COLUMNS } from "@/lib/landing-content";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-14 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Hosptic AI home">
              <Logo size={34} title="Hosptic AI" />
              <span className="text-[17px] font-extrabold tracking-tight text-ink">
                Hosptic <span className="font-semibold text-muted">AI</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Conversational analysis for hospital data. Clearer insights for better decisions.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-ink">{col.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-muted transition hover:text-rose">{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Hosptic AI. All rights reserved.</p>
          <p>Statistical results describe associations in the data and do not establish cause.</p>
        </div>
      </div>
    </footer>
  );
}
