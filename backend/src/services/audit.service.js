const logger = require("../utils/logger");

/**
 * Writes an audit entry inside the caller's tenant transaction, so the record
 * commits or rolls back together with the action it describes.
 * Metadata must never contain patient values, file contents or credentials.
 */
async function recordAudit(tx, { organizationId, userId, action, resourceType, resourceId, metadata }) {
  await tx.auditLog.create({
    data: {
      organizationId,
      userId: userId || null,
      action,
      resourceType,
      resourceId: resourceId || null,
      metadata: metadata || undefined,
    },
  });
  logger.info("audit", { action, resourceType });
}

module.exports = { recordAudit };
