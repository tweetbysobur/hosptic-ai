const { PrismaClient } = require("@prisma/client");

let client;

function getPrisma() {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return client;
}

async function disconnectPrisma() {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

module.exports = { getPrisma, disconnectPrisma };
