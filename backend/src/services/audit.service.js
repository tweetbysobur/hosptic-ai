// Append-only audit trail. Metadata must never contain patient data, file
// contents, passwords or tokens. Callers pass ids, names and counts only.
async function record(tx, { organizationId, userId, action, resourceType, resourceId = null, metadata = null }) {
  await tx.auditLog.create({
    data: { organizationId, userId, action, resourceType, resourceId, metadata },
  });
}

async function list(tx, { limit = 50, cursor } = {}) {
  const rows = await tx.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

module.exports = { record, list };
