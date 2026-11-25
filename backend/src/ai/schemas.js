const { z } = require("zod");
const { ANALYSIS_TYPE_NAMES } = require("../analytics/planner");

// Strict schemas. Unknown keys are rejected so the model cannot smuggle extra instructions into the pipeline.
const intentSchema = z
  .object({
    analysisType: z.enum(ANALYSIS_TYPE_NAMES),
    variables: z
      .object({
        outcome: z.string().trim().min(1).max(160).optional(),
        group: z.string().trim().min(1).max(160).optional(),
        predictor: z.string().trim().min(1).max(160).optional(),
        pairedWith: z.string().trim().min(1).max(160).optional(),
      })
      .strict(),
    rationale: z.string().max(1000).optional(),
  })
  .strict();

const interpretationSchema = z
  .object({
    interpretation: z.string().trim().min(20).max(3000),
  })
  .strict();

module.exports = { intentSchema, interpretationSchema };
