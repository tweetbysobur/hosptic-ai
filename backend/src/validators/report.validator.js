const { z } = require("zod");

const createReportSchema = z.object({
  analysisId: z.string().uuid(),
  title: z.string().trim().min(3).max(160).default("Statistical analysis report"),
});

const listReportQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const idParams = z.object({ id: z.string().uuid() });

module.exports = { createReportSchema, listReportQuery, idParams };
