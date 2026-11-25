const { z } = require("zod");

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, "Password must be at least 10 characters").max(128);
const name = (max = 120) => z.string().trim().min(1).max(max);
const id = z.string().uuid();
const idParams = z.object({ id });
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

module.exports = { z, email, password, name, id, idParams, pagination };
