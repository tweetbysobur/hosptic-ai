const { z } = require("./common");
const { operationsSchema } = require("../analytics/cleaning");

const uploadFields = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

const preview = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  version: z.enum(["current", "original", "processed"]).default("current"),
});

const download = z.object({ version: z.enum(["original", "processed"]).default("original") });

const clean = z.object({ operations: operationsSchema }).strict();

module.exports = { uploadFields, preview, download, clean };
