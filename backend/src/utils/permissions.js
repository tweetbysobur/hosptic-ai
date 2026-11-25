const ROLES = Object.freeze({
  ORGANIZATION_ADMIN: "ORGANIZATION_ADMIN",
  RESEARCHER: "RESEARCHER",
  ANALYST: "ANALYST",
  VIEWER: "VIEWER",
});

const PERMISSIONS = Object.freeze({
  "org:read": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST, ROLES.VIEWER],
  "org:update": [ROLES.ORGANIZATION_ADMIN],
  "members:read": [ROLES.ORGANIZATION_ADMIN],
  "members:manage": [ROLES.ORGANIZATION_ADMIN],
  "datasets:read": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST, ROLES.VIEWER],
  "datasets:upload": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER],
  "datasets:preview": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST],
  "datasets:download": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST],
  "datasets:delete": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER],
  "analysis:read": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST, ROLES.VIEWER],
  "analysis:create": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST],
  "reports:read": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER, ROLES.ANALYST, ROLES.VIEWER],
  "reports:create": [ROLES.ORGANIZATION_ADMIN, ROLES.RESEARCHER],
});

function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) {
    throw new Error(`Unknown permission: ${permission}`);
  }
  return allowed.includes(role);
}

module.exports = { ROLES, PERMISSIONS, can };
