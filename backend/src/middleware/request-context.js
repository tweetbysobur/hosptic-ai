const { uuid } = require("../utils/crypto");
const logger = require("../utils/logger");

// Adds a request id and logs method, route, status and timing only.
function requestContext(req, res, next) {
  req.id = uuid();
  res.setHeader("X-Request-Id", req.id);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    logger.info("request", {
      requestId: req.id,
      method: req.method,
      path: req.baseUrl + (req.route?.path || ""),
      status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000000n),
    });
  });
  next();
}

module.exports = { requestContext };
