const { randomUUID } = require("crypto");
const { withTenant } = require("../db/tenant");
const { getPrisma } = require("../db/prisma");
const { getStorage, reportKey } = require("../storage");
const { recordAudit } = require("./audit.service");
const { renderReportPdf } = require("./report-renderer");
const { paginate, pageMeta } = require("../utils/http");
const { notFound, unprocessable } = require("../utils/AppError");
const logger = require("../utils/logger");

const reportView = (r) => ({
  id: r.id,
  analysisId: r.analysisId,
  title: r.title,
  status: r.status,
  generatedById: r.generatedById,
  createdAt: r.createdAt,
  downloadPath: r.status === "READY" ? `/api/v1/reports/${r.id}/download` : null,
});

async function createReport(auth, { analysisId, title }) {
  const context = await withTenant(auth.organizationId, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: { id: analysisId, organizationId: auth.organizationId },
      include: { result: true, dataset: true },
    });
    if (!analysis) throw notFound("Analysis not found");
    if (analysis.status !== "COMPLETED" || !analysis.result) {
      throw unprocessable("Reports can only be generated for completed analyses");
    }
    const organization = await tx.organization.findUnique({ where: { id: auth.organizationId } });
    const report = await tx.report.create({
      data: {
        id: randomUUID(),
        organizationId: auth.organizationId,
        analysisId: analysis.id,
        generatedById: auth.userId,
        title,
        status: "PENDING",
      },
    });
    return { analysis, organization, report };
  }, auth.userId);

  const user = await getPrisma().user.findUnique({ where: { id: auth.userId }, select: { fullName: true } });
  const storageKey = reportKey(auth.organizationId, context.report.id);
  try {
    const pdf = await renderReportPdf({
      title,
      generatedAt: new Date().toISOString(),
      generatedBy: user ? user.fullName : "Unknown user",
      organization: { name: context.organization.name },
      dataset: {
        name: context.analysis.dataset.name,
        rowCount: context.analysis.dataset.rowCount,
        columnCount: context.analysis.dataset.columnCount,
        fileType: context.analysis.dataset.fileType,
      },
      analysis: {
        question: context.analysis.question,
        methodology: context.analysis.result.methodology,
        results: context.analysis.result.statisticalResults,
        interpretation: context.analysis.result.interpretation,
        assumptions: context.analysis.result.assumptions,
        limitations: context.analysis.result.limitations,
        visualizationData: context.analysis.result.visualizationData,
      },
    });
    await getStorage().put(storageKey, pdf, "application/pdf");
    const ready = await withTenant(auth.organizationId, async (tx) => {
      const updated = await tx.report.update({ where: { id: context.report.id }, data: { status: "READY", storageKey } });
      await recordAudit(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: "report.generated",
        resourceType: "Report",
        resourceId: updated.id,
        metadata: { analysisId: context.analysis.id },
      });
      return updated;
    }, auth.userId);
    return reportView(ready);
  } catch (err) {
    logger.error("Report generation failed", { reportId: context.report.id, message: err && err.message });
    const failed = await withTenant(auth.organizationId, (tx) =>
      tx.report.update({ where: { id: context.report.id }, data: { status: "FAILED" } }), auth.userId);
    return reportView(failed);
  }
}

async function listReports(auth, query) {
  const { page, pageSize, skip, take } = paginate(query);
  return withTenant(auth.organizationId, async (tx) => {
    const where = { organizationId: auth.organizationId };
    const [items, total] = await Promise.all([
      tx.report.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.report.count({ where }),
    ]);
    return { items: items.map(reportView), meta: pageMeta({ page, pageSize }, total) };
  }, auth.userId);
}

async function getReport(auth, id) {
  return withTenant(auth.organizationId, async (tx) => {
    const report = await tx.report.findFirst({ where: { id, organizationId: auth.organizationId } });
    if (!report) throw notFound("Report not found");
    return reportView(report);
  }, auth.userId);
}

async function downloadReport(auth, id) {
  const report = await withTenant(auth.organizationId, async (tx) => {
    const found = await tx.report.findFirst({ where: { id, organizationId: auth.organizationId } });
    if (!found) throw notFound("Report not found");
    if (found.status !== "READY" || !found.storageKey) throw unprocessable("This report is not ready for download");
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "report.downloaded",
      resourceType: "Report",
      resourceId: found.id,
    });
    return found;
  }, auth.userId);
  const buffer = await getStorage().get(report.storageKey);
  return { buffer, filename: `hosptic-report-${report.id}.pdf` };
}

module.exports = { createReport, listReports, getReport, downloadReport };
