// Single Prisma client, connected as the restricted application role.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const env = require("./env");

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter, log: env.isProd ? ["error"] : ["warn", "error"] });

module.exports = prisma;
