import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { requestCookieHeader } from "@/lib/auth/request";

export async function GET() {
  const session = await resolveSession({ cookieHeader: await requestCookieHeader() });
  return NextResponse.json({ state: session.state }, { headers: { "Cache-Control": "no-store" } });
}
