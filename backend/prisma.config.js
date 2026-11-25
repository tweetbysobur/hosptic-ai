// Prisma CLI configuration. Migrations run as the owner role (DIRECT_URL).
// The API itself connects as the restricted role (DATABASE_URL) through the
// pg driver adapter in src/config/prisma.js.
require("dotenv").config({ quiet: true });

module.exports = {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL },
};
