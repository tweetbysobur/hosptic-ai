const { forRequest } = require("./tenant.service");
const audit = require("./audit.service");
const { randomToken, sha256, uuid } = require("../utils/crypto");
const { notFound, conflict, badRequest } = require("../utils/errors");

const INVITE_TTL_DAYS = 7;

// Plain-language disclosure the frontend shows before an admin turns on AI.
const AI_DISCLOSURE = {
  provider: "Z.ai",
  summary:
    "When enabled, Hosptic AI sends your analysis question, column names, column types and summary statistics to Z.ai to interpret the question and explain results. Raw rows are never sent. Columns detected as patient identifiers (names, phone numbers, emails, addresses, ID numbers, dates of birth) are excluded entirely.",
  whatIsSent: ["Analysis question", "Column names and inferred types", "Category labels for low-cardinality columns", "Computed statistical results"],
  whatIsNeverSent: ["Raw dataset rows", "Columns flagged as identifiers", "User passwords or tokens"],
  calculations: "All numbers are computed by Hosptic's own statistics engine. The AI only explains them.",
};

const orgView = (o) => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  email: o.email,
  aiProcessingEnabled: o.aiProcessingEnabled,
  aiProcessingUpdatedAt: o.aiProcessingUpdatedAt,
  aiDisclosure: AI_DISCLOSURE,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

const memberView = (m) => ({
  id: m.id,
  role: m.role,
  status: m.status,
  createdAt: m.createdAt,
  user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email },
});

const get = (req) =>
  forRequest(req, async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: req.auth.organizationId } });
    if (!org) throw notFound("Organization");
    return orgView(org);
  });

const update = (req, input) =>
  forRequest(req, async (tx) => {
    const data = { ...input };
    if (input.aiProcessingEnabled !== undefined) data.aiProcessingUpdatedAt = new Date();
    const org = await tx.organization.update({ where: { id: req.auth.organizationId }, data });
    await audit.record(tx, {
      organizationId: org.id,
      userId: req.auth.userId,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: org.id,
      metadata: { fields: Object.keys(input), aiProcessingEnabled: input.aiProcessingEnabled },
    });
    return orgView(org);
  });

const listMembers = (req) =>
  forRequest(req, async (tx) => {
    const rows = await tx.membership.findMany({
      where: { organizationId: req.auth.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(memberView);
  });

// No email service in the MVP: the one-time token is returned to the admin
// once, who shares it with the invitee. Only its hash is stored.
const invite = (req, input) =>
  forRequest(req, async (tx) => {
    const [row] = await tx.$queryRaw`SELECT auth_ensure_invited_user(${uuid()}::uuid, ${input.email}, ${input.fullName}) AS id`;
    const userId = row.id;
    const existing = await tx.membership.findFirst({ where: { organizationId: req.auth.organizationId, userId } });
    if (existing) throw conflict("This person is already a member or has a pending invitation");

    const token = randomToken(32);
    const membership = await tx.membership.create({
      data: {
        organizationId: req.auth.organizationId,
        userId,
        role: input.role,
        status: "INVITED",
        inviteTokenHash: sha256(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
        invitedById: req.auth.userId,
      },
      include: { user: true },
    });
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "member.invited",
      resourceType: "membership",
      resourceId: membership.id,
      metadata: { role: input.role },
    });
    return { member: memberView(membership), inviteToken: token, inviteExpiresAt: membership.inviteExpiresAt };
  });

async function assertAnotherAdmin(tx, organizationId, excludingId) {
  const admins = await tx.membership.count({
    where: { organizationId, role: "ORGANIZATION_ADMIN", status: "ACTIVE", id: { not: excludingId } },
  });
  if (admins === 0) throw badRequest("An organisation must keep at least one active admin");
}

const updateMember = (req, id, input) =>
  forRequest(req, async (tx) => {
    const m = await tx.membership.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!m) throw notFound("Member");
    const losingAdmin =
      m.role === "ORGANIZATION_ADMIN" &&
      ((input.role && input.role !== "ORGANIZATION_ADMIN") || input.status === "SUSPENDED");
    if (losingAdmin) await assertAnotherAdmin(tx, m.organizationId, m.id);
    if (input.status === "ACTIVE" && m.status === "INVITED") throw badRequest("Invited members activate by accepting");

    const updated = await tx.membership.update({ where: { id }, data: input, include: { user: true } });
    // Suspension takes effect on the next request: authenticate() requires an ACTIVE membership.
    await audit.record(tx, {
      organizationId: m.organizationId,
      userId: req.auth.userId,
      action: "member.updated",
      resourceType: "membership",
      resourceId: id,
      metadata: input,
    });
    return memberView(updated);
  });

const removeMember = (req, id) =>
  forRequest(req, async (tx) => {
    const m = await tx.membership.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!m) throw notFound("Member");
    if (m.role === "ORGANIZATION_ADMIN") await assertAnotherAdmin(tx, m.organizationId, m.id);
    await tx.membership.delete({ where: { id } });
    await audit.record(tx, {
      organizationId: m.organizationId,
      userId: req.auth.userId,
      action: "member.removed",
      resourceType: "membership",
      resourceId: id,
    });
  });

const auditLogs = (req, query) => forRequest(req, (tx) => audit.list(tx, query));

module.exports = { get, update, listMembers, invite, updateMember, removeMember, auditLogs, AI_DISCLOSURE };
