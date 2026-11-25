const { randomUUID } = require("crypto");
const { withTenant, withUser } = require("../db/tenant");
const { getPrisma } = require("../db/prisma");
const { hashPassword, verifyPassword, verifyDummy, randomToken } = require("../utils/security");
const { AppError, forbidden, unauthorized, conflict } = require("../utils/AppError");
const { ROLES } = require("../utils/permissions");
const { signAccessToken } = require("../utils/tokens");
const { issueSession, storeRefreshToken } = require("./session.service");
const { slugify } = require("../utils/slug");

const publicUser = (user) => ({ id: user.id, fullName: user.fullName, email: user.email });
const publicOrganization = (org) => ({ id: org.id, name: org.name, slug: org.slug });

/**
 * Creates the user, the organisation and the initial ORGANIZATION_ADMIN membership
 * in one transaction. The organisation id is generated here so the tenant context
 * can be set before the insert, which the RLS policy requires.
 */
async function register({ fullName, email, password, organizationName, organizationEmail }) {
  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const slug = `${slugify(organizationName)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;

  let created;
  try {
    created = await withTenant(
      organizationId,
      async (tx) => {
        const user = await tx.user.create({ data: { id: userId, fullName, email, passwordHash } });
        const organization = await tx.organization.create({
          data: { id: organizationId, name: organizationName, slug, email: organizationEmail || null },
        });
        const membership = await tx.membership.create({
          data: { organizationId, userId, role: ROLES.ORGANIZATION_ADMIN },
        });
        const refreshToken = await storeRefreshToken(tx, userId, organizationId);
        return { user, organization, membership, refreshToken };
      },
      userId
    );
  } catch (err) {
    if (err && err.code === "P2002") {
      throw conflict("An account with this email already exists");
    }
    throw err;
  }

  return {
    user: publicUser(created.user),
    organization: publicOrganization(created.organization),
    role: created.membership.role,
    session: {
      accessToken: signAccessToken({ userId, organizationId }),
      refreshToken: created.refreshToken,
      csrfToken: randomToken(24),
    },
  };
}

async function login({ email, password, organizationId }) {
  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    await verifyDummy(password);
    throw unauthorized("Invalid email or password");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Invalid email or password");
  }

  const memberships = await withUser(user.id, (tx) =>
    tx.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true, role: true },
    })
  );
  if (memberships.length === 0) {
    throw forbidden("This account has no active organisation membership");
  }

  const membership = organizationId
    ? memberships.find((m) => m.organizationId === organizationId)
    : memberships[0];
  if (!membership) {
    throw forbidden("You are not a member of the requested organisation");
  }

  const organization = await withTenant(membership.organizationId, (tx) =>
    tx.organization.findUnique({ where: { id: membership.organizationId } })
  );
  const session = await issueSession(user.id, membership.organizationId);
  return {
    user: publicUser(user),
    organization: publicOrganization(organization),
    role: membership.role,
    organizations: memberships.length > 1 ? memberships.map((m) => m.organizationId) : undefined,
    session,
  };
}

async function me(auth) {
  const { user, organization } = await withTenant(
    auth.organizationId,
    async (tx) => ({
      user: await tx.user.findUnique({ where: { id: auth.userId } }),
      organization: await tx.organization.findUnique({ where: { id: auth.organizationId } }),
    }),
    auth.userId
  );
  if (!user || !organization) {
    throw new AppError(404, "Account not found", "NOT_FOUND");
  }
  return { user: publicUser(user), organization: publicOrganization(organization), role: auth.role };
}

module.exports = { register, login, me };
