import { NextResponse } from "next/server";
import { callBackend, applySetCookies } from "@/lib/auth/backend";
import { AUTH_ENDPOINTS } from "@/lib/auth/contract";
import { FAILURE, messageForStatus } from "@/lib/auth/messages";
import { normaliseEmail, validateLogin, hasErrors } from "@/lib/auth/validation";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const errors = validateLogin(body);
  if (hasErrors(errors)) return NextResponse.json({ error: "Check the highlighted fields.", fields: errors }, { status: 422 });

  const result = await callBackend({
    path: AUTH_ENDPOINTS.login,
    method: "POST",
    body: { email: normaliseEmail(body.email), password: body.password },
  });

  if (result.failure) return NextResponse.json({ error: FAILURE[result.failure] }, { status: result.failure === "unconfigured" ? 503 : 502 });
  if (!result.ok) return NextResponse.json({ error: messageForStatus(result.status, "login") }, { status: result.status });

  return applySetCookies(NextResponse.json({ ok: true }), result.setCookies);
}
