const { z } = require("zod");

const uploadFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const idParams = z.object({ id: z.string().uuid() });

const previewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = { uploadFieldsSchema, listQuerySchema, idParams, previewQuerySchema };
