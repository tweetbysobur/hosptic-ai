// CSRF protection: signed double-submit token.
// GET /api/v1/auth/csrf sets a signed token cookie and returns the same token
// in the body. Every state-changing request must echo it in X-CSRF-Token.
// The signature stops a token planted by a sibling subdomain from validating.
const env = require("../config/env");
const { randomToken, hmac, safeEqual } = require("../utils/crypto");
const { CSRF, base } = require("../utils/cookies");
const { AppError } = require("../utils/errors");

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function issue(res) {
  const nonce = randomToken(24);
  const token = `${nonce}.${hmac(env.JWT_SECRET, `csrf:${nonce}`)}`;
  res.cookie(CSRF, token, { ...base(), httpOnly: false, maxAge: 12 * 3600000 });
  return token;
}

function isValid(token) {
  if (typeof token !== "string") return false;
  const [nonce, sig] = token.split(".");
  return Boolean(nonce && sig) && safeEqual(sig, hmac(env.JWT_SECRET, `csrf:${nonce}`));
}

function csrfProtection(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[CSRF];
  if (!header || !cookie || !safeEqual(header, cookie) || !isValid(header)) {
    return next(new AppError(403, "CSRF_INVALID", "Missing or invalid CSRF token"));
  }
  next();
}

module.exports = { csrfProtection, issue };
