const { env } = require("./config/env");
const { createApp } = require("./app");
const { disconnectPrisma } = require("./db/prisma");
const logger = require("./utils/logger");

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info("Hosptic AI API listening", { port: env.PORT, env: env.NODE_ENV, aiEnabled: env.AI_ENABLED });
});

async function shutdown(signal) {
  logger.info("Shutting down", { signal });
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { app };
