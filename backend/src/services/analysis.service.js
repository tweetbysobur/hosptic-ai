const { withTenant } = require("../db/tenant");
const { findActiveDataset, loadStoredTable } = require("./dataset.service");
const { recordAudit } = require("./audit.service");
const { recommendAnalysis } = require("../ai/intent.service");
const { interpretResults } = require("../ai/interpretation.service");
const { runAnalysis, METHOD_NAMES } = require("../analytics/engine");
const { AnalysisError } = require("../analytics/errors");
const { AppError, notFound, conflict, unprocessable } = require("../utils/AppError");
const { paginate, pageMeta } = require("../utils/http");
const logger = require("../utils/logger");

const AI_DISCLOSURE = {
  provider: "Z.ai",
  dataSent:
    "Question text, column names, inferred types, missing percentages, category labels (up to 15 per column) and aggregate statistics. No row-level values and no columns flagged as personal data.",
  note: "Statistics are calculated by deterministic code. The AI selects the method and writes the explanation.",
};

// AnalysisError and AppError messages are written for users. Anything else is replaced.
function safeErrorMessage(err) {
  if (err instanceof AnalysisError || err instanceof AppError) return err.message;
  return "The analysis failed due to an internal error";
}

const analysisView = (a) => ({
  id: a.id,
  status: a.status,
  question: a.question,
  analysisType: a.analysisType,
  datasetId: a.datasetId,
  userId: a.userId,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  errorMessage: a.status === "FAILED" ? a.errorMessage : undefined,
  methodology: a.result ? a.result.methodology : null,
  results: a.result ? a.result.statisticalResults : null,
  interpretation: a.result ? a.result.interpretation : null,
  assumptions: a.result ? a.result.assumptions : [],
  limitations: a.result ? a.result.limitations : [],
  visualizationData: a.result ? a.result.visualizationData : null,
});

async function createAnalysis(auth, { datasetId, question }) {
  const analysis = await withTenant(
    auth.organizationId,
    async (tx) => {
      const dataset = await findActiveDataset(tx, auth, datasetId);
      if (dataset.status !== "READY") throw unprocessable("The dataset is not ready for analysis");
      const created = await tx.analysis.create({
        data: {
          organizationId: auth.organizationId,
          datasetId: dataset.id,
          userId: auth.userId,
          question,
          status: "PENDING",
        },
      });
      await recordAudit(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: "analysis.created",
        resourceType: "Analysis",
        resourceId: created.id,
        metadata: { datasetId: dataset.id },
      });
      return created;
    },
    auth.userId
  );
  return executeAnalysis(auth, analysis.id);
}

/**
 * Runs the 16-step workflow for one analysis record:
 * load data, get AI method recommendation, validate it, run the engine,
 * get AI interpretation, validate it, then save the result.
 */
async function executeAnalysis(auth, analysisId) {
  const context = await withTenant(auth.organizationId, async (tx) => {
    const analysis = await tx.analysis.findFirst({ where: { id: analysisId, organizationId: auth.organizationId } });
    if (!analysis) throw notFound("Analysis not found");
    if (analysis.status === "PROCESSING") throw conflict("This analysis is already running");
    const dataset = await tx.dataset.findFirst({
      where: { id: analysis.datasetId, organizationId: auth.organizationId, deletedAt: null, status: "READY" },
      include: { columns: { orderBy: { position: "asc" } } },
    });
    if (!dataset) throw unprocessable("The dataset is no longer available for analysis");
    await tx.analysis.update({ where: { id: analysis.id }, data: { status: "PROCESSING", errorMessage: null } });
    return { analysis, dataset };
  }, auth.userId);

  try {
    const table = await loadStoredTable(context.dataset);
    const columns = context.dataset.columns.map((c) => ({
      columnName: c.columnName,
      inferredType: c.inferredType,
      isSensitive: c.isSensitive,
      missingCount: c.missingCount,
      uniqueCount: c.uniqueCount,
    }));

    const { plan, rationale } = await recommendAnalysis({ question: context.analysis.question, columns, table });
    const analysis = runAnalysis(plan, table, columns);
    analysis.methodology.aiDisclosure = { ...AI_DISCLOSURE, rationale };

    const interpretation = await interpretResults({ question: context.analysis.question, analysis }).catch((err) => {
      logger.warn("Interpretation step failed", { code: err && err.code });
      return { text: null, reason: "AI interpretation was unavailable" };
    });
    if (!interpretation.text) {
      analysis.limitations.push(`Interpretation not generated: ${interpretation.reason}. Review the statistics directly.`);
    }

    await withTenant(auth.organizationId, async (tx) => {
      await tx.analysisResult.upsert({
        where: { analysisId: context.analysis.id },
        create: {
          organizationId: auth.organizationId,
          analysisId: context.analysis.id,
          methodology: analysis.methodology,
          statisticalResults: analysis.results,
          interpretation: interpretation.text,
          visualizationData: analysis.visualizationData,
          assumptions: analysis.assumptions,
          limitations: analysis.limitations,
        },
        update: {
          methodology: analysis.methodology,
          statisticalResults: analysis.results,
          interpretation: interpretation.text,
          visualizationData: analysis.visualizationData,
          assumptions: analysis.assumptions,
          limitations: analysis.limitations,
        },
      });
      await tx.analysis.update({
        where: { id: context.analysis.id },
        data: { status: "COMPLETED", analysisType: analysis.analysisType, errorMessage: null },
      });
      await recordAudit(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: "analysis.completed",
        resourceType: "Analysis",
        resourceId: context.analysis.id,
        metadata: { analysisType: analysis.analysisType, methodName: METHOD_NAMES[analysis.analysisType] },
      });
    }, auth.userId);
  } catch (err) {
    if (!(err instanceof AnalysisError) && !(err instanceof AppError)) {
      logger.error("Analysis pipeline error", { analysisId, name: err && err.name, message: err && err.message });
    }
    const message = safeErrorMessage(err);
    await withTenant(auth.organizationId, async (tx) => {
      await tx.analysis.update({
        where: { id: context.analysis.id },
        data: { status: "FAILED", errorMessage: message },
      });
      await recordAudit(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        action: "analysis.failed",
        resourceType: "Analysis",
        resourceId: context.analysis.id,
      });
    }, auth.userId);
  }

  return getAnalysis(auth, context.analysis.id);
}

async function getAnalysis(auth, id) {
  return withTenant(auth.organizationId, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: { result: true },
    });
    if (!analysis) throw notFound("Analysis not found");
    return analysisView(analysis);
  }, auth.userId);
}

async function listAnalyses(auth, query) {
  const { page, pageSize, skip, take } = paginate(query);
  return withTenant(auth.organizationId, async (tx) => {
    const where = {
      organizationId: auth.organizationId,
      ...(query.datasetId ? { datasetId: query.datasetId } : {}),
    };
    const [items, total] = await Promise.all([
      tx.analysis.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { result: true } }),
      tx.analysis.count({ where }),
    ]);
    return { items: items.map(analysisView), meta: pageMeta({ page, pageSize }, total) };
  }, auth.userId);
}

async function retryAnalysis(auth, id) {
  const analysis = await withTenant(auth.organizationId, (tx) =>
    tx.analysis.findFirst({ where: { id, organizationId: auth.organizationId } }), auth.userId);
  if (!analysis) throw notFound("Analysis not found");
  if (auth.role !== "ORGANIZATION_ADMIN" && analysis.userId !== auth.userId) {
    throw new AppError(403, "You can retry only your own analyses", "FORBIDDEN");
  }
  if (analysis.status !== "FAILED") throw conflict("Only failed analyses can be retried");
  return executeAnalysis(auth, id);
}

module.exports = { createAnalysis, getAnalysis, listAnalyses, retryAnalysis, executeAnalysis, analysisView };
