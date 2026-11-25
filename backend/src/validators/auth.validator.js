const { z } = require("zod");

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Password must include a letter and a number");

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email,
  password,
  organizationName: z.string().trim().min(2).max(160),
  organizationEmail: z.string().trim().toLowerCase().email().max(254).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  organizationId: z.string().uuid().optional(),
});

module.exports = { registerSchema, loginSchema, email, password };
