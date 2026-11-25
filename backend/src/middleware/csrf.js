const { AppError } = require("../utils/AppError");
const { CSRF_COOKIE, CSRF_HEADER, ACCESS_COOKIE, REFRESH_COOKIE } = require("../utils/cookies");
const { timingSafeEqual } = require("crypto");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Double-submit cookie check. Enforced for any state-changing request that carries auth cookies.
// Bearer-token requests are not cookie-authenticated, so they are not subject to CSRF.
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const usesCookies = Boolean(req.cookies && (req.cookies[ACCESS_COOKIE] || req.cookies[REFRESH_COOKIE]));
  if (!usesCookies) return next();

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return next(new AppError(403, "CSRF token missing or invalid", "CSRF_FAILED"));
  }
  const ok = timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  if (!ok) return next(new AppError(403, "CSRF token missing or invalid", "CSRF_FAILED"));
  return next();
}

module.exports = { csrfProtection };
