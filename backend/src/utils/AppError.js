class AppError extends Error {
  constructor(status, message, code = "ERROR", details = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, message, "BAD_REQUEST", details);
const unauthorized = (message = "Authentication required") => new AppError(401, message, "UNAUTHORIZED");
const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, message, "FORBIDDEN");
const notFound = (message = "Resource not found") => new AppError(404, message, "NOT_FOUND");
const conflict = (message) => new AppError(409, message, "CONFLICT");
const unprocessable = (message, details) => new AppError(422, message, "UNPROCESSABLE", details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
