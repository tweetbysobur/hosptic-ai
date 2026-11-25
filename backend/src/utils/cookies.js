const { env } = require("../config/env");

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function baseOptions() {
  return {
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE,
  };
}

function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    httpOnly: true,
    path: "/api",
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    httpOnly: true,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  // Readable by the frontend so it can echo the value in the X-CSRF-Token header.
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseOptions(),
    httpOnly: false,
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), httpOnly: true, path: "/api" });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), httpOnly: true, path: "/api/v1/auth" });
  res.clearCookie(CSRF_COOKIE, { ...baseOptions(), httpOnly: false, path: "/" });
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  setAuthCookies,
  clearAuthCookies,
};
