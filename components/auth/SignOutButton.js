"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { apiClient } from "@/lib/api/client";
import { clearLocalWorkspaceData } from "@/lib/auth/local-data";

// Ends the session at the backend and clears cached workspace data on this device. Local data is
// cleared even when the backend cannot be reached, and the sign-in page says so.
export default function SignOutButton({ variant = "icon" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    let reached = true;
    try {
      await apiClient.auth.logout();
    } catch {
      reached = false;
    }
    clearLocalWorkspaceData();
    router.replace(reached ? "/login?signedOut=1" : "/login?signedOut=local");
    router.refresh();
  };

  if (variant === "button") {
    return (
      <button type="button" onClick={signOut} disabled={pending} className="btn">
        <Icon name="LogOut" size={15} /> {pending ? "Signing out…" : "Sign out"}
      </button>
    );
  }

  return (
    <button type="button" onClick={signOut} disabled={pending} className="icon-btn disabled:opacity-50" aria-label="Sign out" title="Sign out">
      <Icon name="LogOut" size={16} />
    </button>
  );
}
