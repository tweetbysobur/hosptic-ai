// Server-side helpers for the same-origin proxy at /api/v1/*. Pure functions so they can be tested.

import { API_PREFIX } from "./config.js";

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const FORWARD_REQUEST_HEADERS = ["accept", "content-type", "cookie", "x-csrf-token", "authorization"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control"];

// Builds the upstream URL. Only plain path segments are accepted, so the proxy cannot be used to
// reach other backend paths or traverse directories.
export function resolveUpstream(baseUrl, segments, search = "") {
  if (!baseUrl || !Array.isArray(segments) || segments.length === 0) return null;
  if (!segments.every((s) => typeof s === "string" && SEGMENT_PATTERN.test(s))) return null;
  const base = baseUrl.replace(/\/+$/, "");
  const query = typeof search === "string" && search.startsWith("?") ? search : "";
  return `${base}${API_PREFIX}/${segments.join("/")}${query}`;
}

export function buildUpstreamHeaders(incoming) {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

// Copies only the headers the browser needs. Set-Cookie is forwarded so the backend's HTTP-only
// cookies land on the frontend origin. Encoding and hop-by-hop headers are dropped because fetch
// has already decoded the body.
export function buildDownstreamHeaders(upstream) {
  const headers = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  const cookies = typeof upstream.getSetCookie === "function" ? upstream.getSetCookie() : [];
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return headers;
}
