// Same-origin proxy to the Hosptic backend. The browser calls /api/v1/*, this handler forwards the
// request with its cookies, CSRF header and body, and returns the backend response unchanged.
import { apiConfigured } from "@/lib/api/config";
import { resolveUpstream, buildUpstreamHeaders, buildDownstreamHeaders } from "@/lib/api/proxy";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 180000; // Analyses can make two calls to the AI service.

function envelope(status, code, message) {
  return Response.json({ success: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

async function proxy(request, context) {
  const { path } = await context.params;
  if (!apiConfigured()) return envelope(503, "NOT_CONNECTED", "The Hosptic service is not connected yet.");

  const url = resolveUpstream(process.env.HOSPTIC_API_URL, path, new URL(request.url).search);
  if (!url) return envelope(404, "NOT_FOUND", "Route not found");

  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers: buildUpstreamHeaders(request.headers),
      body: hasBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return envelope(502, "UPSTREAM_UNAVAILABLE", "The Hosptic service could not be reached. Try again.");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream.headers),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
