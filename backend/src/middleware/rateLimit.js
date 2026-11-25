const rateLimit = require("express-rate-limit");
const { env } = require("../config/env");

const message = { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, try again later" } };

const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
});

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
});

module.exports = { apiLimiter, authLimiter };
