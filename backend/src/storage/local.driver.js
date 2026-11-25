// Local filesystem storage for development and tests only (refused in
// production by config/env.js). Downloads go through an HMAC-signed,
// expiring URL served by GET /api/v1/files/:token.
const fs = require("fs/promises");
const path = require("path");
const env = require("../config/env");
const { hmac, safeEqual } = require("../utils/crypto");

function createLocalDriver() {
  const root = path.resolve(env.STORAGE_LOCAL_DIR);

  const resolve = (key) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    name: "local",
    async put(key, body) {
      const full = resolve(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body, { mode: 0o600 });
    },
    get: (key) => fs.readFile(resolve(key)),
    async remove(key) {
      await fs.rm(resolve(key), { force: true });
    },
    async signedUrl(key, { fileName, contentType }) {
      const payload = Buffer.from(
        JSON.stringify({ k: key, n: fileName, t: contentType, e: Date.now() + env.SIGNED_URL_TTL_SECONDS * 1000 })
      ).toString("base64url");
      const token = `${payload}.${hmac(env.JWT_SECRET, `file:${payload}`)}`;
      return `${env.PUBLIC_API_URL || ""}/api/v1/files/${token}`;
    },
    verifyToken(token) {
      const [payload, sig] = String(token).split(".");
      if (!payload || !sig || !safeEqual(sig, hmac(env.JWT_SECRET, `file:${payload}`))) return null;
      try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString());
        return typeof data.k === "string" && data.e > Date.now() ? data : null;
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createLocalDriver };
