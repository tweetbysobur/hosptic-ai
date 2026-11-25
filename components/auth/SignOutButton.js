"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { postJson, clearLocalWorkspaceData } from "@/lib/auth/client";

// Ends the session at the backend, clears cached workspace data on this device, then leaves
// the protected area. Local data is cleared even when the backend cannot be reached.
export default function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    const result = await postJson("/api/auth/logout", {});
    clearLocalWorkspaceData();
    const backendReached = result.ok && result.data?.backendReached !== false;
    router.replace(backendReached ? "/login?signedOut=1" : "/login?signedOut=local");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="icon-btn disabled:opacity-50"
      aria-label="Sign out"
      title="Sign out"
    >
      <Icon name="LogOut" size={16} />
    </button>
  );
}
