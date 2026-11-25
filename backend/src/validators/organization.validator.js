const { z } = require("zod");
const { email } = require("./auth.validator");

const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    email: z.union([email, z.literal("").transform(() => null)]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const inviteSchema = z.object({
  email,
  role: z.enum(["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"]),
});

const updateMemberSchema = z
  .object({
    role: z.enum(["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, "At least one field is required");

const memberIdParams = z.object({ id: z.string().uuid() });

module.exports = { updateOrganizationSchema, inviteSchema, updateMemberSchema, memberIdParams };
