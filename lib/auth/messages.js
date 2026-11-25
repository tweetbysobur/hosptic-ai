// User-facing messages. They are derived from the ApiError code and status, so the UI never
// depends on the wording of a backend response beyond the codes in the contract.

import { ApiError } from "../api/errors.js";

export const FAILURE = {
  unconfigured: "The sign-in service is not connected yet. Contact your administrator.",
  network: "We could not reach the sign-in service. Check your connection and try again.",
  timeout: "The sign-in service took too long to respond. Try again.",
  server: "The sign-in service is temporarily unavailable. Try again in a few minutes.",
  unknown: "Something went wrong. Try again.",
};

export function messageForError(error) {
  if (!(error instanceof ApiError)) return FAILURE.unknown;
  if (error.code === "NOT_CONNECTED") return FAILURE.unconfigured;
  if (error.code === "NETWORK_ERROR") return FAILURE.network;
  if (error.code === "TIMEOUT") return FAILURE.timeout;
  if (error.code === "UPSTREAM_UNAVAILABLE") return FAILURE.server;
  if (error.sessionExpired) return "Your session has ended. Sign in again to continue.";
  if (error.status >= 500) return FAILURE.server;
  if (error.status === 429) return "Too many attempts. Wait a few minutes before trying again.";
  if (error.code === "CSRF_FAILED") return "Your request could not be verified. Refresh the page and try again.";
  if (error.code === "VALIDATION_ERROR") return "Some details were not accepted. Check the highlighted fields.";
  return error.message || FAILURE.unknown;
}
