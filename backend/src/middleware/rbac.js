const { can } = require("../config/permissions");
const { forbidden, unauthorized } = require("../utils/errors");

// Usage: router.post("/", authenticate, requirePermission("dataset:upload"), handler)
const requirePermission = (permission) => (req, res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!can(req.auth.role, permission)) return next(forbidden());
  next();
};

module.exports = { requirePermission };
