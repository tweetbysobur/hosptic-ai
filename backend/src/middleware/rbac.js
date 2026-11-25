const { can } = require("../utils/permissions");
const { forbidden, unauthorized } = require("../utils/AppError");

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!can(req.auth.role, permission)) return next(forbidden());
    return next();
  };
}

module.exports = { requirePermission };
