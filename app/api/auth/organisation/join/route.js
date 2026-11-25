import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { callBackend, applySetCookies } from "@/lib/auth/backend";
import { AUTH_ENDPOINTS } from "@/lib/auth/contract";
import { FAILURE, messageForStatus } from "@/lib/auth/messages";
import { validateJoinOrganisation, hasErrors } from "@/lib/auth/validation";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const errors = validateJoinOrganisation(body);
  if (hasErrors(errors)) return NextResponse.json({ error: "Check the highlighted fields.", fields: errors }, { status: 422 });

  const jar = await cookies();
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  const result = await callBackend({
    path: AUTH_ENDPOINTS.joinOrganisation,
    method: "POST",
    cookieHeader,
    body: { code: String(body.code).trim() },
  });

  if (result.failure) return NextResponse.json({ error: FAILURE[result.failure] }, { status: result.failure === "unconfigured" ? 503 : 502 });
  if (!result.ok) return NextResponse.json({ error: messageForStatus(result.status, "join") }, { status: result.status });

  return applySetCookies(NextResponse.json({ ok: true }), result.setCookies);
}
