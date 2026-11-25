const { withTenant } = require("../db/tenant");
const { notFound, conflict, badRequest } = require("../utils/AppError");
const { recordAudit } = require("./audit.service");
const { getPrisma } = require("../db/prisma");

const orgView = (org) => ({ id: org.id, name: org.name, slug: org.slug, email: org.email, createdAt: org.createdAt });

async function getOrganization(auth) {
  return withTenant(auth.organizationId, async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: auth.organizationId } });
    if (!org) throw notFound("Organisation not found");
    return orgView(org);
  }, auth.userId);
}

async function updateOrganization(auth, changes) {
  return withTenant(auth.organizationId, async (tx) => {
    const org = await tx.organization.update({
      where: { id: auth.organizationId },
      data: { ...(changes.name !== undefined ? { name: changes.name } : {}), ...(changes.email !== undefined ? { email: changes.email } : {}) },
    });
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "organization.updated",
      resourceType: "Organization",
      resourceId: org.id,
      metadata: { fields: Object.keys(changes) },
    });
    return orgView(org);
  }, auth.userId);
}

const memberView = (m) => ({
  id: m.id,
  role: m.role,
  status: m.status,
  joinedAt: m.createdAt,
  user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email },
});

async function listMembers(auth) {
  return withTenant(auth.organizationId, async (tx) => {
    const members = await tx.membership.findMany({
      where: { organizationId: auth.organizationId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map(memberView);
  }, auth.userId);
}

async function countActiveAdmins(tx, organizationId, excludeMembershipId) {
  return tx.membership.count({
    where: {
      organizationId,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
    },
  });
}

/**
 * Adds an existing account to the organisation. Accounts are created by registration,
 * so an invitation for an unknown email is rejected instead of creating a placeholder user.
 */
async function inviteMember(auth, { email, role }) {
  const user = await getPrisma().user.findUnique({ where: { email } });
  if (!user) {
    throw notFound("No account exists for this email. The person must register first.");
  }
  return withTenant(auth.organizationId, async (tx) => {
    const existing = await tx.membership.findFirst({
      where: { organizationId: auth.organizationId, userId: user.id },
    });
    if (existing) throw conflict("This user is already a member of the organisation");
    const membership = await tx.membership.create({
      data: { organizationId: auth.organizationId, userId: user.id, role },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "member.invited",
      resourceType: "Membership",
      resourceId: membership.id,
      metadata: { role },
    });
    return memberView(membership);
  }, auth.userId);
}

async function updateMember(auth, membershipId, changes) {
  return withTenant(auth.organizationId, async (tx) => {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: auth.organizationId },
    });
    if (!target) throw notFound("Member not found");

    const losesAdmin =
      target.role === "ORGANIZATION_ADMIN" &&
      target.status === "ACTIVE" &&
      ((changes.role && changes.role !== "ORGANIZATION_ADMIN") || changes.status === "SUSPENDED");
    if (losesAdmin && (await countActiveAdmins(tx, auth.organizationId, target.id)) === 0) {
      throw badRequest("An organisation must keep at least one active administrator");
    }

    const updated = await tx.membership.update({
      where: { id: target.id },
      data: changes,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "member.updated",
      resourceType: "Membership",
      resourceId: target.id,
      metadata: { changes: Object.keys(changes) },
    });
    return memberView(updated);
  }, auth.userId);
}

async function removeMember(auth, membershipId) {
  return withTenant(auth.organizationId, async (tx) => {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: auth.organizationId },
    });
    if (!target) throw notFound("Member not found");
    if (target.role === "ORGANIZATION_ADMIN" && target.status === "ACTIVE") {
      if ((await countActiveAdmins(tx, auth.organizationId, target.id)) === 0) {
        throw badRequest("An organisation must keep at least one active administrator");
      }
    }
    await tx.membership.delete({ where: { id: target.id } });
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "member.removed",
      resourceType: "Membership",
      resourceId: target.id,
    });
    return { id: target.id, removed: true };
  }, auth.userId);
}

module.exports = { getOrganization, updateOrganization, listMembers, inviteMember, updateMember, removeMember };
