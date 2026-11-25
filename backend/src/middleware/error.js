const { ZodError } = require("zod");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
}

// Central error handler. Internal messages and stack traces are never returned to clients.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
  }
  if (err && err.code === "P2002") {
    return res.status(409).json({ success: false, error: { code: "CONFLICT", message: "A record with this value already exists" } });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: { code: "FILE_TOO_LARGE", message: "The uploaded file is too large" } });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } });
  }
  logger.error("Unhandled error", { name: err && err.name, message: err && err.message, path: req.path });
  return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
}

module.exports = { notFoundHandler, errorHandler };
