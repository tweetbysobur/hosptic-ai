const { z, email, name } = require("./common");
const { ROLES } = require("../config/permissions");

const update = z
  .object({
    name: name(160).optional(),
    email: email.optional(),
    aiProcessingEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");

const invite = z.object({ email, fullName: name(), role: z.enum(ROLES) }).strict();

const updateMember = z
  .object({ role: z.enum(ROLES).optional(), status: z.enum(["ACTIVE", "SUSPENDED"]).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide role or status");

module.exports = { update, invite, updateMember };
