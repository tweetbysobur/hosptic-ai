const env = require("./config/env");
const prisma = require("./config/prisma");
const logger = require("./utils/logger");
const { createApp } = require("./app");

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info("server_started", { port: env.PORT, env: env.NODE_ENV, aiConfigured: env.aiConfigured, storage: env.STORAGE_DRIVER });
});

async function shutdown(signal) {
  logger.info("server_stopping", { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
