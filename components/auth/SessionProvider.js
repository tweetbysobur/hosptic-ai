"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import Notice from "./Notice";
import { apiClient } from "@/lib/api/client";
import { loadSession } from "@/lib/auth/session";
import { messageForError, FAILURE } from "@/lib/auth/messages";

const SessionContext = createContext(null);

// The current session, or null outside a protected route.
export function useSession() {
  return useContext(SessionContext);
}

// Protects the live workspace. The check runs in the browser because the access cookie is scoped
// to /api, so the server cannot read it. Nothing is rendered until the backend confirms the session,
// and workspace data only ever arrives through authenticated API calls.
export default function SessionGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ status: "loading" });

  useEffect(() => {
    let active = true;
    setResult({ status: "loading" });
    loadSession(apiClient).then((outcome) => {
      if (!active) return;
      if (outcome.state === "authenticated") {
        setResult({ status: "ready", session: outcome.session });
      } else if (outcome.state === "expired") {
        router.replace(`/login?reason=expired&next=${encodeURIComponent(pathname)}`);
      } else {
        setResult({ status: "error", message: messageForError(outcome.error) || FAILURE.unknown });
      }
    });
    return () => { active = false; };
  }, [attempt, pathname, router]);

  if (result.status === "ready") {
    return <SessionContext.Provider value={result.session}>{children}</SessionContext.Provider>;
  }

  if (result.status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-5">
        <div className="w-full max-w-[440px] rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <Notice title="The workspace could not be opened">{result.message}</Notice>
          <div className="mt-5">
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-surface px-6 text-[15px] font-semibold text-ink transition hover:border-primary/50 hover:bg-blush">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas" role="status" aria-live="polite">
      <Logo size={40} title="Hosptic AI" />
      <p className="text-sm text-ink-2">Loading your workspace…</p>
    </div>
  );
}
