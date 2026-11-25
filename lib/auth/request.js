// Server-only: reads the current request's cookies and serialises them for the backend.
import { cookies } from "next/headers";

export async function requestCookieHeader() {
  const jar = await cookies();
  return jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
}
