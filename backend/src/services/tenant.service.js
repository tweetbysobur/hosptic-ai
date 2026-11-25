// Tenant context for row-level security.
//
// Every query that touches hospital data runs through withTenant(). It opens a
// transaction, sets the organisation and user as transaction-local settings
// with parameterised SQL, and runs the callback with the transaction client.
// When the transaction ends PostgreSQL discards the settings, so a pooled
// connection never carries one hospital's context into another request.
const prisma = require("../config/prisma");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value, name) {
  if (value == null) return "";
  if (!UUID_RE.test(value)) throw new Error(`Invalid ${name} for tenant context`);
  return value;
}

async function withTenant({ organizationId = null, userId = null }, fn, options = {}) {
  const org = assertId(organizationId, "organizationId");
  const user = assertId(userId, "userId");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.current_org_id', ${org}, true), set_config('app.current_user_id', ${user}, true)`;
      return fn(tx);
    },
    { maxWait: 10000, timeout: options.timeout || 20000 }
  );
}

// Convenience for request handlers: tenant context from the authenticated membership.
const forRequest = (req, fn, options) =>
  withTenant({ organizationId: req.auth.organizationId, userId: req.auth.userId }, fn, options);

module.exports = { withTenant, forRequest, UUID_RE };
