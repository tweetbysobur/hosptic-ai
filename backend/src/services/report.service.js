const env = require("../config/env");
const { forRequest } = require("./tenant.service");
const audit = require("./audit.service");
const { storage, keys } = require("../storage");
const { renderReport } = require("./report-pdf");
const analysisService = require("./analysis.service");
const { uuid } = require("../utils/crypto");
const { notFound, unprocessable } = require("../utils/errors");
const logger = require("../utils/logger");

const view = (r) => ({
  id: r.id,
  analysisId: r.analysisId,
  title: r.title,
  status: r.status,
  error: r.status === "FAILED" ? r.errorMessage : null,
  generatedBy: r.generatedBy ? { id: r.generatedBy.id, fullName: r.generatedBy.fullName } : null,
  createdAt: r.createdAt,
});

const include = { generatedBy: { select: { id: true, fullName: true } } };

async function create(req, { analysisId, title }) {
  const organizationId = req.auth.organizationId;
  const ctx = await forRequest(req, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: { id: analysisId, organizationId },
      include: { result: true, user: { select: { id: true, fullName: true } }, dataset: true },
    });
    if (!analysis) throw notFound("Analysis");
    if (analysis.status !== "COMPLETED" || !analysis.result) throw unprocessable("Reports can only be generated for completed analyses");
    const organization = await tx.organization.findUnique({ where: { id: organizationId } });
    const me = await tx.user.findUnique({ where: { id: req.auth.userId }, select: { fullName: true } });
    const report = await tx.report.create({
      data: {
        id: uuid(),
        organizationId,
        analysisId,
        generatedById: req.auth.userId,
        // Default title names the method; the question appears once, below it.
        title: title || `${analysis.result.methodology.test} report`,
        status: "PENDING",
      },
    });
    return { analysis, organization, me, report };
  });

  const { analysis, organization, me, report } = ctx;
  try {
    const pdf = await renderReport({
      title: report.title,
      organization,
      dataset: analysis.dataset,
      analysis: analysisService.view(analysis),
      generatedBy: me.fullName,
      generatedAt: report.createdAt,
    });
    const storageKey = keys.report(organizationId, report.id);
    await storage().put(storageKey, pdf, "application/pdf");
    return await forRequest(req, async (tx) => {
      const done = await tx.report.update({ where: { id: report.id }, data: { status: "COMPLETED", storageKey }, include });
      await audit.record(tx, {
        organizationId,
        userId: req.auth.userId,
        action: "report.generated",
        resourceType: "report",
        resourceId: report.id,
        metadata: { analysisId, bytes: pdf.length },
      });
      return view(done);
    });
  } catch (err) {
    logger.error("report_failed", { reportId: report.id, name: err.name, message: err.message });
    return forRequest(req, async (tx) =>
      view(await tx.report.update({ where: { id: report.id }, data: { status: "FAILED", errorMessage: "The report could not be generated" }, include }))
    );
  }
}

const list = (req, { limit, cursor, analysisId }) =>
  forRequest(req, async (tx) => {
    const rows = await tx.report.findMany({
      where: { organizationId: req.auth.organizationId, ...(analysisId ? { analysisId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include,
    });
    const more = rows.length > limit;
    const items = (more ? rows.slice(0, limit) : rows).map(view);
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  });

const get = (req, id) =>
  forRequest(req, async (tx) => {
    const r = await tx.report.findFirst({ where: { id, organizationId: req.auth.organizationId }, include });
    if (!r) throw notFound("Report");
    return view(r);
  });

async function downloadUrl(req, id) {
  const r = await forRequest(req, async (tx) => {
    const row = await tx.report.findFirst({ where: { id, organizationId: req.auth.organizationId } });
    if (!row) throw notFound("Report");
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "report.download_link_created",
      resourceType: "report",
      resourceId: id,
    });
    return row;
  });
  if (r.status !== "COMPLETED" || !r.storageKey) throw unprocessable("This report is not ready");
  if (!keys.belongsTo(r.storageKey, req.auth.organizationId)) throw notFound("Report");
  const fileName = `hosptic-report-${r.id.slice(0, 8)}.pdf`;
  const url = await storage().signedUrl(r.storageKey, { fileName, contentType: "application/pdf" });
  return { url, expiresInSeconds: env.SIGNED_URL_TTL_SECONDS, fileName };
}

module.exports = { create, list, get, downloadUrl };
