const { getPrisma } = require("./prisma");

const TX_OPTIONS = { maxWait: 5000, timeout: 30000 };

/**
 * Runs fn inside a transaction whose tenant context is set with
 * set_config(..., is_local = true). The setting is discarded at commit or
 * rollback, so pooled connections never carry one organisation into another request.
 */
async function withTenant(organizationId, fn, userId = null) {
  if (!organizationId) {
    throw new Error("withTenant requires an organizationId");
  }
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    if (userId) {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    }
    return fn(tx);
  }, TX_OPTIONS);
}

/** Runs fn with only the user context set. Used for login, refresh and membership lookups. */
async function withUser(userId, fn) {
  if (!userId) {
    throw new Error("withUser requires a userId");
  }
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

module.exports = { withTenant, withUser };
