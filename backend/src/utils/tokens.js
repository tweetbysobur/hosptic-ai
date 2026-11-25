const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

const ISSUER = "hosptic-ai";

function signAccessToken({ userId, organizationId }) {
  return jwt.sign({ sub: userId, org: organizationId, typ: "access" }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
  });
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: ISSUER });
  if (payload.typ !== "access") {
    throw new jwt.JsonWebTokenError("Wrong token type");
  }
  return payload;
}

function signRefreshToken({ userId, jti }) {
  return jwt.sign({ sub: userId, jti, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
  });
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"], issuer: ISSUER });
  if (payload.typ !== "refresh") {
    throw new jwt.JsonWebTokenError("Wrong token type");
  }
  return payload;
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
