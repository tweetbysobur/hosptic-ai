// Logs never include request bodies, file contents, row values or credentials.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL || "info"] || LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const line = { time: new Date().toISOString(), level, message, ...(meta || {}) };
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

module.exports = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
