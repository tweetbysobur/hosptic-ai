const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;
// Used to keep login timing similar when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync("hosptic-dummy-password", BCRYPT_ROUNDS);

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
const verifyDummy = (password) => bcrypt.compare(password, DUMMY_HASH);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

module.exports = { hashPassword, verifyPassword, verifyDummy, sha256, randomToken };
