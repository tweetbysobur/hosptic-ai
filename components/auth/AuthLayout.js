import Link from "next/link";
import Logo from "@/components/Logo";
import PulseBackground from "./PulseBackground";
import AuthArt from "./AuthArt";

// Shared frame for sign-in, registration and onboarding. Keeps the brand consistent with the landing page.
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-canvas">
      <PulseBackground />
      <header className="relative px-5 pt-6 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Hosptic home">
          <Logo size={32} title="Hosptic" />
          <span className="text-[19px] font-extrabold tracking-tight text-rose">
            Hosptic
          </span>
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[440px]">
          <AuthArt />
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <h1 className="text-balance text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
            {description && <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-2">{description}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
