import { redirect } from "next/navigation";
import { resolveSession } from "@/lib/auth/session";
import { requestCookieHeader } from "@/lib/auth/request";

// Every route under /app requires a valid session. The check runs on the server before any
// workspace code is sent. Auth pages never redirect back here for an unavailable service,
// which prevents redirect loops.
export default async function ProtectedLayout({ children }) {
  const session = await resolveSession({ cookieHeader: await requestCookieHeader() });
  if (session.state === "authenticated") return children;
  if (session.state === "expired") redirect("/login?reason=expired&next=/app");
  if (session.state === "unavailable") redirect("/login?reason=unavailable&next=/app");
  redirect("/login?next=/app");
}
