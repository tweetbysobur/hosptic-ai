const { z } = require("zod");

const uuid = z.string().uuid();

function paginate(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function pageMeta({ page, pageSize }, total) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

module.exports = { uuid, paginate, pageMeta };
