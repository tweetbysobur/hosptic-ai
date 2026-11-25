// One error type for every backend failure. Built from the standard envelope
// { success: false, error: { code, message, details? } } or from transport failures.

export class ApiError extends Error {
  constructor({ status = 0, code = "UNKNOWN", message = "Something went wrong.", details = [], sessionExpired = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
    this.sessionExpired = sessionExpired;
  }
}

export function fromEnvelope(status, body) {
  const error = body && typeof body === "object" ? body.error : null;
  if (error && typeof error === "object") {
    return new ApiError({
      status,
      code: typeof error.code === "string" ? error.code : "UNKNOWN",
      message: typeof error.message === "string" ? error.message : "Something went wrong.",
      details: error.details,
    });
  }
  return new ApiError({ status, code: status >= 500 ? "SERVER_ERROR" : "UNKNOWN" });
}

export const networkError = () => new ApiError({ code: "NETWORK_ERROR", message: "We could not reach the server." });
export const timeoutError = () => new ApiError({ code: "TIMEOUT", message: "The server took too long to respond." });

// Maps backend field paths (for example "fullName") onto form field ids.
export function fieldErrorsFrom(error) {
  const fields = {};
  if (error instanceof ApiError) {
    for (const d of error.details) {
      if (d && typeof d.path === "string" && typeof d.message === "string" && !fields[d.path]) fields[d.path] = d.message;
    }
  }
  return fields;
}
