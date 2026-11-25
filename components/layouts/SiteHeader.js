"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { NAV_LINKS } from "@/lib/landing-content";

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Hosptic AI home" onClick={close}>
          <Logo size={34} title="Hosptic AI" />
          <span className="text-[17px] font-extrabold tracking-tight text-ink">
            Hosptic <span className="font-semibold text-muted">AI</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-[15px] font-medium text-ink-2 transition hover:bg-surface hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button href="/app" variant="ghost" size="sm" title="Sign-in is not yet available. Opens the demo workspace.">Sign In</Button>
          <Button href="/app" variant="primary" size="sm">Get Started</Button>
        </div>

        <button
          type="button"
          className="ml-auto grid size-10 place-items-center rounded-full border border-line bg-surface text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name={open ? "X" : "Menu"} size={18} />
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-surface md:hidden">
          <nav aria-label="Mobile" className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-5 py-4">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={close} className="rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-blush">
                {l.label}
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button href="/app" variant="secondary" size="sm" className="h-11">Sign In</Button>
              <Button href="/app" variant="primary" size="sm" className="h-11">Get Started</Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
