const { z, id, pagination } = require("./common");

const create = z.object({ analysisId: id, title: z.string().trim().min(3).max(200).optional() }).strict();
const list = pagination.extend({ analysisId: id.optional() });

module.exports = { create, list };
