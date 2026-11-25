const argon2 = require("argon2");
const prisma = require("../config/prisma");
const { withTenant } = require("./tenant.service");
const audit = require("./audit.service");
const tokens = require("./token.service");
const { uuid, sha256 } = require("../utils/crypto");
const { slugify } = require("../utils/slug");
const { unauthorized, conflict, badRequest } = require("../utils/errors");

const HASH_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
// Verified against when an email is unknown, so response time does not reveal
// whether an account exists.
let dummyHash;
const getDummyHash = async () => (dummyHash ||= await argon2.hash("not-a-real-password", HASH_OPTS));

const hashPassword = (pw) => argon2.hash(pw, HASH_OPTS);

const publicUser = (u) => ({ id: u.id, fullName: u.fullName, email: u.email });
const publicMembership = (m) => ({ id: m.id, role: m.role, status: m.status, organizationId: m.organizationId });

async function createSession(tx, { userId, membershipId }) {
  const sessionId = uuid();
  const refresh = tokens.newRefresh({ userId, sessionId });
  await tx.session.create({
    data: { id: sessionId, userId, membershipId, tokenHash: refresh.tokenHash, expiresAt: tokens.refreshExpiry() },
  });
  return {
    accessToken: tokens.signAccess({ userId, membershipId, sessionId }),
    refreshToken: refresh.token,
  };
}

// Registration creates the user, the organisation and the admin membership in
// one transaction. Ids are generated here so the tenant context can be set
// before the first insert and RLS checks every row.
async function register(input) {
  const userId = uuid();
  const organizationId = uuid();
  const membershipId = uuid();
  const passwordHash = await hashPassword(input.password);

  try {
    return await withTenant({ organizationId, userId }, async (tx) => {
      const organization = await tx.organization.create({
        data: {
          id: organizationId,
          name: input.organizationName,
          slug: slugify(input.organizationName),
          email: input.organizationEmail.toLowerCase(),
          aiProcessingEnabled: Boolean(input.aiProcessingConsent),
          aiProcessingUpdatedAt: input.aiProcessingConsent ? new Date() : null,
        },
      });
      const user = await tx.user.create({
        data: { id: userId, fullName: input.fullName, email: input.email.toLowerCase(), passwordHash },
      });
      const membership = await tx.membership.create({
        data: { id: membershipId, organizationId, userId, role: "ORGANIZATION_ADMIN", status: "ACTIVE" },
      });
      const session = await createSession(tx, { userId, membershipId });
      await audit.record(tx, {
        organizationId,
        userId,
        action: "organization.registered",
        resourceType: "organization",
        resourceId: organizationId,
        metadata: { aiProcessingEnabled: organization.aiProcessingEnabled },
      });
      return { user: publicUser(user), organization, membership: publicMembership(membership), ...session };
    });
  } catch (err) {
    if (err.code === "P2002") throw conflict("An account with this email already exists");
    throw err;
  }
}

async function findCredentials(email) {
  const rows = await prisma.$queryRaw`SELECT * FROM auth_find_user_by_email(${email.toLowerCase()})`;
  return rows[0] || null;
}

async function login({ email, password, organizationSlug }) {
  const cred = await findCredentials(email);
  if (!cred || !cred.passwordHash) {
    await argon2.verify(await getDummyHash(), password).catch(() => false);
    throw unauthorized("Invalid email or password");
  }
  const valid = await argon2.verify(cred.passwordHash, password).catch(() => false);
  if (!valid) throw unauthorized("Invalid email or password");

  const userId = cred.id;
  // Organisation comes from the user's own active memberships, never from input.
  const memberships = await withTenant({ userId }, (tx) =>
    tx.membership.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } })
  );
  if (!memberships.length) throw unauthorized("This account has no active organisation membership");

  let membership = memberships[0];
  if (organizationSlug) {
    const orgs = [];
    for (const m of memberships) {
      orgs.push(
        await withTenant({ organizationId: m.organizationId, userId }, (tx) =>
          tx.organization.findUnique({ where: { id: m.organizationId }, select: { id: true, slug: true } })
        )
      );
    }
    const match = orgs.find((o) => o && o.slug === organizationSlug);
    if (!match) throw unauthorized("You are not a member of that organisation");
    membership = memberships.find((m) => m.organizationId === match.id);
  }

  return withTenant({ organizationId: membership.organizationId, userId }, async (tx) => {
    const session = await createSession(tx, { userId, membershipId: membership.id });
    await audit.record(tx, {
      organizationId: membership.organizationId,
      userId,
      action: "auth.login",
      resourceType: "user",
      resourceId: userId,
    });
    return session;
  });
}

async function refresh(refreshToken) {
  const payload = refreshToken && tokens.verify(refreshToken, "refresh");
  if (!payload) throw unauthorized("Session expired");
  const userId = payload.sub;

  const result = await withTenant({ userId }, async (tx) => {
    const session = await tx.session.findUnique({ where: { id: payload.sid }, include: { membership: true } });
    if (!session || session.userId !== userId || session.revokedAt || session.expiresAt < new Date()) {
      return { error: "expired" };
    }
    if (session.tokenHash !== sha256(payload.jti)) {
      // Reuse of a rotated refresh token means it was copied: revoke the whole
      // session. Returned rather than thrown so the revocation commits.
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return { error: "reused" };
    }
    if (session.membership.status !== "ACTIVE") return { error: "inactive" };

    const next = tokens.newRefresh({ userId, sessionId: session.id });
    await tx.session.update({
      where: { id: session.id },
      data: { tokenHash: next.tokenHash, expiresAt: tokens.refreshExpiry() },
    });
    return {
      accessToken: tokens.signAccess({ userId, membershipId: session.membershipId, sessionId: session.id }),
      refreshToken: next.token,
    };
  });
  if (result.error === "inactive") throw unauthorized("Membership is no longer active");
  if (result.error) throw unauthorized("Session expired");
  return result;
}

async function logout({ userId, sessionId, organizationId }) {
  await withTenant({ organizationId, userId }, async (tx) => {
    await tx.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } });
    await audit.record(tx, { organizationId, userId, action: "auth.logout", resourceType: "user", resourceId: userId });
  });
}

async function me(auth) {
  return withTenant({ organizationId: auth.organizationId, userId: auth.userId }, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: auth.userId } });
    const organization = await tx.organization.findUnique({ where: { id: auth.organizationId } });
    const memberships = await tx.membership.count({ where: { userId: auth.userId, status: "ACTIVE" } });
    return {
      user: publicUser(user),
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      membership: { id: auth.membershipId, role: auth.role },
      organizationCount: memberships,
    };
  });
}

// Invited users accept with the one-time token their admin shared with them.
async function acceptInvite({ token, fullName, password }) {
  const rows = await prisma.$queryRaw`SELECT * FROM auth_find_invitation(${sha256(token)})`;
  const invite = rows[0];
  if (!invite || invite.inviteExpiresAt < new Date()) throw badRequest("Invitation is invalid or has expired");

  const passwordHash = await hashPassword(password);
  return withTenant({ organizationId: invite.organizationId, userId: invite.userId }, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: invite.userId } });
    if (user.passwordHash) {
      // Existing account: the token alone is not enough, the owner must prove the password.
      const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
      if (!valid) throw unauthorized("Use your existing password to accept this invitation");
    } else {
      await tx.user.update({ where: { id: invite.userId }, data: { fullName, passwordHash } });
    }
    await tx.membership.update({
      where: { id: invite.id },
      data: { status: "ACTIVE", inviteTokenHash: null, inviteExpiresAt: null },
    });
    const session = await createSession(tx, { userId: invite.userId, membershipId: invite.id });
    await audit.record(tx, {
      organizationId: invite.organizationId,
      userId: invite.userId,
      action: "member.invite_accepted",
      resourceType: "membership",
      resourceId: invite.id,
    });
    return session;
  });
}

module.exports = { register, login, refresh, logout, me, acceptInvite, hashPassword };
