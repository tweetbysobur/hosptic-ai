// Authentication: verifies the access token cookie, then resolves the
// organisation and role from the user's membership in the database. The
// organisation is never taken from the request.
const tokens = require("../services/token.service");
const { withTenant } = require("../services/tenant.service");
const { ACCESS } = require("../utils/cookies");
const { unauthorized } = require("../utils/errors");

async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[ACCESS];
    const payload = token && tokens.verify(token, "access");
    if (!payload) throw unauthorized();

    const userId = payload.sub;
    const ctx = await withTenant({ userId }, async (tx) => {
      // Sequential: a transaction holds one connection.
      const membership = await tx.membership.findFirst({ where: { id: payload.mid, userId, status: "ACTIVE" } });
      const session = await tx.session.findFirst({ where: { id: payload.sid, userId, revokedAt: null } });
      return { membership, session };
    });
    if (!ctx.membership || !ctx.session) throw unauthorized();

    req.auth = {
      userId,
      sessionId: payload.sid,
      membershipId: ctx.membership.id,
      organizationId: ctx.membership.organizationId,
      role: ctx.membership.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
