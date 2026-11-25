const authService = require("../services/auth.service");
const { rotateRefreshToken, revokeRefreshToken } = require("../services/session.service");
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require("../utils/cookies");

function applySession(res, session) {
  setAuthCookies(res, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    csrfToken: session.csrfToken,
  });
}

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    applySession(res, result.session);
    res.status(201).json({
      success: true,
      data: { user: result.user, organization: result.organization, role: result.role, accessToken: result.session.accessToken },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    applySession(res, result.session);
    res.json({
      success: true,
      data: {
        user: result.user,
        organization: result.organization,
        role: result.role,
        organizations: result.organizations,
        accessToken: result.session.accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await revokeRefreshToken(req.cookies && req.cookies[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.json({ success: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const session = await rotateRefreshToken(req.cookies && req.cookies[REFRESH_COOKIE]);
    applySession(res, session);
    res.json({ success: true, data: { accessToken: session.accessToken } });
  } catch (err) {
    clearAuthCookies(res);
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const data = await authService.me(req.auth);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, refresh, me };
