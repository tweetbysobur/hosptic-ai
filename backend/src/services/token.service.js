const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { randomToken, sha256 } = require("../utils/crypto");

const ISSUER = "hosptic-ai";

function signAccess({ userId, membershipId, sessionId }) {
  return jwt.sign({ typ: "access", mid: membershipId, sid: sessionId }, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    algorithm: "HS256",
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

function newRefresh({ userId, sessionId }) {
  const jti = randomToken(32);
  const token = jwt.sign({ typ: "refresh", sid: sessionId, jti }, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    algorithm: "HS256",
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  return { token, tokenHash: sha256(jti) };
}

function verify(token, typ) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ["HS256"] });
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);

module.exports = { signAccess, newRefresh, verify, refreshExpiry };
