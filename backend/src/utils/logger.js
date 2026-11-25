// Minimal structured logger. Never pass request bodies, dataset values,
// tokens or credentials to it.
const env = require("../config/env");

function log(level, msg, meta = {}) {
  if (env.isTest && level !== "error") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...meta });
  (level === "error" ? console.error : console.log)(line);
}

module.exports = {
  info: (m, meta) => log("info", m, meta),
  warn: (m, meta) => log("warn", m, meta),
  error: (m, meta) => log("error", m, meta),
};
