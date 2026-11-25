const { rateLimit } = require("express-rate-limit");
const env = require("../config/env");

const make = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10000 : limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, try again later" } },
  });

module.exports = {
  globalLimiter: make(15 * 60000, 600),
  authLimiter: make(15 * 60000, 20),
  uploadLimiter: make(60 * 60000, 30),
  analysisLimiter: make(60000, 20),
};
