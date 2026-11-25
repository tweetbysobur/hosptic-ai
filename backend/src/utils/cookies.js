const env = require("../config/env");

const ACCESS = "hosptic_access";
const REFRESH = "hosptic_refresh";
const CSRF = "hosptic_csrf";

const base = () => ({ secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: "/" });

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS, accessToken, { ...base(), httpOnly: true, maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60000 });
  // Refresh token is only ever sent to the auth endpoints.
  res.cookie(REFRESH, refreshToken, {
    ...base(),
    httpOnly: true,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS, { ...base(), httpOnly: true });
  res.clearCookie(REFRESH, { ...base(), httpOnly: true, path: "/api/v1/auth" });
}

module.exports = { ACCESS, REFRESH, CSRF, base, setAuthCookies, clearAuthCookies };
