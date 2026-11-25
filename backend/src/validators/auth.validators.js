const { z, email, password, name } = require("./common");

const register = z
  .object({
    fullName: name(),
    email,
    password,
    organizationName: name(160),
    organizationEmail: email,
    aiProcessingConsent: z.boolean().optional().default(false),
  })
  .strict();

const login = z.object({ email, password: z.string().min(1).max(128), organizationSlug: z.string().max(80).optional() }).strict();

const acceptInvite = z.object({ token: z.string().min(20).max(200), fullName: name(), password }).strict();

module.exports = { register, login, acceptInvite };
