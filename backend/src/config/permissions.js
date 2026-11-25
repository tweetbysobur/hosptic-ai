// Role-based permissions. Every route declares the permission it needs and the
// rbac middleware checks it against the role from the user's membership.

const ROLES = ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"];

const PERMISSIONS = {
  "organization:read": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"],
  "organization:update": ["ORGANIZATION_ADMIN"],
  "members:read": ["ORGANIZATION_ADMIN"],
  "members:manage": ["ORGANIZATION_ADMIN"],
  "audit:read": ["ORGANIZATION_ADMIN"],

  "dataset:read": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"],
  "dataset:upload": ["ORGANIZATION_ADMIN", "RESEARCHER"],
  "dataset:clean": ["ORGANIZATION_ADMIN", "RESEARCHER"],
  "dataset:delete": ["ORGANIZATION_ADMIN", "RESEARCHER"],
  "dataset:download": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST"],

  "analysis:read": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"],
  "analysis:create": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST"],

  "report:read": ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"],
  "report:create": ["ORGANIZATION_ADMIN", "RESEARCHER"],
};

function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission: ${permission}`);
  return allowed.includes(role);
}

module.exports = { ROLES, PERMISSIONS, can };
