const { z } = require("zod");

const createAnalysisSchema = z.object({
  datasetId: z.string().uuid(),
  question: z.string().trim().min(5, "Ask a complete question").max(1000),
});

const listAnalysisQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  datasetId: z.string().uuid().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

module.exports = { createAnalysisSchema, listAnalysisQuery, idParams };
