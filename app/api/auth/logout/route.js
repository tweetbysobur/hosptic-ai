import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { callBackend, applySetCookies } from "@/lib/auth/backend";
import { AUTH_ENDPOINTS } from "@/lib/auth/contract";

// Ends the session at the backend, then forwards the backend's cookie-clearing headers.
// The session is treated as ended on the client even if the backend cannot be reached.
export async function POST() {
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  const result = await callBackend({ path: AUTH_ENDPOINTS.logout, method: "POST", cookieHeader });
  const response = NextResponse.json({ ok: true, backendReached: !result.failure });
  return applySetCookies(response, result.setCookies);
}
