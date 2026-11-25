const { z, id, pagination } = require("./common");
const { planSchema } = require("../analytics/plan");

const create = z
  .object({
    datasetId: id,
    question: z.string().trim().min(3).max(1000),
    // Optional explicit plan. When present no AI is used for planning.
    plan: planSchema.optional(),
  })
  .strict();

const list = pagination.extend({
  datasetId: id.optional(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});

module.exports = { create, list };
