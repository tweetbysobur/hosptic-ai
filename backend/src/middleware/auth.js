const { ACCESS_COOKIE } = require("../utils/cookies");
const { verifyAccessToken } = require("../utils/tokens");
const { withTenant } = require("../db/tenant");
const { unauthorized } = require("../utils/AppError");

function extractToken(req) {
  if (req.cookies && req.cookies[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  const header = req.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/**
 * Authenticates the request and resolves the tenant from the database.
 * The organisation comes from the signed token, but the membership, role and status
 * are re-read on every request. Revoked or suspended members lose access immediately.
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw unauthorized("Session invalid or expired");
    }

    const membership = await withTenant(
      payload.org,
      (tx) =>
        tx.membership.findFirst({
          where: { userId: payload.sub, organizationId: payload.org, status: "ACTIVE" },
          select: { id: true, role: true, userId: true, organizationId: true },
        }),
      payload.sub
    );
    if (!membership) throw unauthorized("Membership is no longer active");

    req.auth = {
      userId: membership.userId,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      role: membership.role,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate };
