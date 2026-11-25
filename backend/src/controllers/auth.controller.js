const auth = require("../services/auth.service");
const { ok, created } = require("../utils/respond");
const { setAuthCookies, clearAuthCookies, REFRESH } = require("../utils/cookies");
const { issue } = require("../middleware/csrf");

exports.csrf = (req, res) => ok(res, { csrfToken: issue(res) });

exports.register = async (req, res) => {
  const result = await auth.register(req.body);
  setAuthCookies(res, result);
  created(res, {
    user: result.user,
    organization: { id: result.organization.id, name: result.organization.name, slug: result.organization.slug },
    membership: result.membership,
    csrfToken: issue(res),
  });
};

exports.login = async (req, res) => {
  const session = await auth.login(req.body);
  setAuthCookies(res, session);
  // Fresh CSRF token after the privilege change.
  ok(res, { csrfToken: issue(res) });
};

exports.refresh = async (req, res) => {
  const session = await auth.refresh(req.cookies?.[REFRESH]);
  setAuthCookies(res, session);
  ok(res, { refreshed: true });
};

exports.logout = async (req, res) => {
  await auth.logout(req.auth);
  clearAuthCookies(res);
  ok(res, { loggedOut: true });
};

exports.me = async (req, res) => ok(res, await auth.me(req.auth));

exports.acceptInvite = async (req, res) => {
  const session = await auth.acceptInvite(req.body);
  setAuthCookies(res, session);
  ok(res, { csrfToken: issue(res) });
};
