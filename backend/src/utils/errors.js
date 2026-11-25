class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, "BAD_REQUEST", msg, details);
const unauthorized = (msg = "Authentication required") => new AppError(401, "UNAUTHORIZED", msg);
const forbidden = (msg = "You do not have permission to do this") => new AppError(403, "FORBIDDEN", msg);
// Cross-tenant access returns 404 so the existence of another hospital's
// resources is never confirmed.
const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
const conflict = (msg) => new AppError(409, "CONFLICT", msg);
const unprocessable = (msg, details) => new AppError(422, "UNPROCESSABLE", msg, details);
const unavailable = (msg) => new AppError(503, "SERVICE_UNAVAILABLE", msg);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, unavailable };
