const { randomUUID } = require("crypto");
const { env } = require("../config/env");
const { withUser } = require("../db/tenant");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/tokens");
const { sha256, randomToken } = require("../utils/security");
const { unauthorized } = require("../utils/AppError");

/** Creates a refresh token row for the user inside the given transaction client. */
async function storeRefreshToken(tx, userId, organizationId) {
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ userId, jti, org: organizationId });
  await tx.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return refreshToken;
}

/** Issues access and refresh tokens for a user bound to one organisation. */
async function issueSession(userId, organizationId) {
  const refreshToken = await withUser(userId, (tx) => storeRefreshToken(tx, userId, organizationId));
  return {
    accessToken: signAccessToken({ userId, organizationId }),
    refreshToken,
    csrfToken: randomToken(24),
  };
}

/** Rotates a refresh token. The old token is revoked and a new session is issued. */
async function rotateRefreshToken(token) {
  if (!token) throw unauthorized("Refresh token missing");
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized("Refresh token invalid or expired");
  }
  const tokenHash = sha256(token);

  const result = await withUser(payload.sub, async (tx) => {
    const stored = await tx.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return null;
    }
    const membership = await tx.membership.findFirst({
      where: { userId: payload.sub, organizationId: payload.org, status: "ACTIVE" },
      select: { organizationId: true },
    });
    if (!membership) return null;
    await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const refreshToken = await storeRefreshToken(tx, payload.sub, membership.organizationId);
    return { refreshToken, organizationId: membership.organizationId };
  });

  if (!result) throw unauthorized("Refresh token revoked or expired");
  return {
    accessToken: signAccessToken({ userId: payload.sub, organizationId: result.organizationId }),
    refreshToken: result.refreshToken,
    csrfToken: randomToken(24),
  };
}

async function revokeRefreshToken(token) {
  if (!token) return;
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return;
  }
  await withUser(payload.sub, (tx) =>
    tx.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  );
}

module.exports = { issueSession, rotateRefreshToken, revokeRefreshToken, storeRefreshToken };
