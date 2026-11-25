const { AppError } = require("../utils/errors");
const logger = require("../utils/logger");

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
}

// Never leaks stack traces, SQL, storage paths or credentials to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } });
  }
  if (err?.name === "MulterError") {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ success: false, error: { code: err.code, message: err.message } });
  }
  logger.error("unhandled_error", { requestId: req.id, name: err?.name, code: err?.code, message: err?.message });
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId: req.id },
  });
}

module.exports = { notFoundHandler, errorHandler };
