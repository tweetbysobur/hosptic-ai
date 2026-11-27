import Link from "next/link";
import Logo from "@/components/Logo";
import { FOOTER_LINKS } from "@/lib/landing-content";

// One horizontal row: brand, links, copyright. Stacks and centres on phones.
export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:justify-between lg:gap-10">
        <Link href="/" className="inline-flex shrink-0 items-center gap-2.5" aria-label="Hosptic home">
          <Logo size={28} title="Hosptic" />
          <span className="text-[16px] font-extrabold tracking-tight text-ink">Hosptic</span>
        </Link>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {FOOTER_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-sm text-ink-2 transition-colors hover:text-rose">{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="shrink-0 text-sm text-ink-2">© 2026 Hosptic. All rights reserved.</p>
      </div>
    </footer>
  );
}
