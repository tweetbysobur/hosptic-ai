// Natural-language analysis workflow.
//
//  1-5. Authenticate, resolve organisation, verify dataset ownership and
//       permission (route middleware + RLS-scoped lookup below).
//  6-7. Read the dataset's column profile (no raw rows leave the server).
//  8-10. Plan: explicit plan, Z.ai intent, or deterministic keyword match.
//        Every plan is validated against real column types.
//  11-12. Run the deterministic statistics engine and verify its output.
//  13-14. Interpretation: Z.ai explains the numbers; the answer is checked
//         against the results, with a deterministic fallback.
//  15-16. Save and return.
//
// Long steps (file read, statistics, AI calls) run outside database
// transactions so no connection is held while waiting on Z.ai.
const env = require("../config/env");
const { forRequest } = require("./tenant.service");
const audit = require("./audit.service");
const datasets = require("./dataset.service");
const { validatePlan } = require("../analytics/plan");
const { runAnalysis } = require("../analytics/engine");
const { planWithAi, planWithKeywords } = require("../ai/intent.service");
const { interpretWithAi, deterministic } = require("../ai/interpretation.service");
const { AppError, notFound, badRequest } = require("../utils/errors");
const logger = require("../utils/logger");

function view(a) {
  const r = a.result;
  return {
    id: a.id,
    datasetId: a.datasetId,
    status: a.status,
    question: a.question,
    analysisType: a.analysisType,
    planSource: a.planSource,
    methodology: r?.methodology ?? null,
    results: r?.statisticalResults ?? null,
    interpretation: r?.interpretation ?? null,
    interpretationSource: r?.interpretationSource ?? null,
    keyFindings: r?.methodology?.keyFindings ?? [],
    assumptions: r?.assumptions ?? [],
    limitations: r?.limitations ?? [],
    visualizationData: r?.visualizationData ?? null,
    error: a.status === "FAILED" ? a.errorMessage : null,
    createdBy: a.user ? { id: a.user.id, fullName: a.user.fullName } : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

const include = { result: true, user: { select: { id: true, fullName: true } } };

async function loadContext(req, datasetId) {
  return forRequest(req, async (tx) => {
    const dataset = await datasets.findActive(tx, req, datasetId);
    datasets.ensureReady(dataset);
    const profile = await datasets.profileFor(tx, datasetId);
    const org = await tx.organization.findUnique({ where: { id: req.auth.organizationId }, select: { aiProcessingEnabled: true } });
    return { dataset, profile, aiAllowed: org.aiProcessingEnabled && env.aiConfigured };
  });
}

async function makePlan(analysis, profile, dataset, aiAllowed) {
  if (analysis.planSource === "user" && analysis.plan) {
    const { plan, notes } = validatePlan(analysis.plan.requested || analysis.plan, profile);
    return { plan, notes, rationale: "Plan supplied by the user.", source: "user" };
  }
  if (aiAllowed) {
    try {
      return await planWithAi(analysis.question, profile, dataset.rowCount);
    } catch (err) {
      // Clarification or unsupported answers from the AI are final.
      if (err instanceof AppError) throw err;
      logger.warn("ai_intent_failed", { analysisId: analysis.id, code: err.code });
      const fallback = planWithKeywords(analysis.question, profile);
      fallback.notes.unshift(`Z.ai was unavailable (${err.message}); columns were matched from the question text instead.`);
      return fallback;
    }
  }
  return planWithKeywords(analysis.question, profile);
}

async function interpretResults(analysis, computed, aiAllowed) {
  if (!aiAllowed) return { ...deterministic(computed), source: "deterministic" };
  try {
    const ai = await interpretWithAi({ question: analysis.question, analysis: computed });
    if (ai.ok) return { interpretation: ai.interpretation, keyFindings: ai.keyFindings, caveats: ai.caveats, source: "zai" };
    return { ...deterministic(computed), source: "deterministic_fallback", note: ai.reason };
  } catch (err) {
    logger.warn("ai_interpretation_failed", { analysisId: analysis.id, code: err.code });
    return { ...deterministic(computed), source: "deterministic_fallback", note: `Z.ai was unavailable (${err.message}).` };
  }
}

async function execute(req, analysisId) {
  const analysis = await forRequest(req, (tx) =>
    tx.analysis.update({ where: { id: analysisId }, data: { status: "PROCESSING", errorMessage: null } })
  );

  try {
    const { dataset, profile, aiAllowed } = await loadContext(req, analysis.datasetId);
    const planned = await makePlan(analysis, profile, dataset, aiAllowed);
    const { table, storageKey } = await datasets.loadTable(dataset);
    const computed = runAnalysis(table, planned.plan, { notes: planned.notes });
    const interp = await interpretResults(analysis, computed, aiAllowed);

    computed.methodology.planSource = planned.source;
    computed.methodology.planRationale = planned.rationale;
    computed.methodology.datasetVersion = dataset.processedStorageKey ? "processed" : "original";
    computed.methodology.externalAiUsed = aiAllowed && (planned.source.startsWith("zai") || interp.source === "zai");
    if (interp.keyFindings?.length) computed.methodology.keyFindings = interp.keyFindings;
    if (interp.note) computed.methodology.interpretationNote = interp.note;
    const limitations = [...computed.limitations, ...(interp.caveats || []).filter((c) => !computed.limitations.includes(c))];

    return await forRequest(req, async (tx) => {
      await tx.analysisResult.deleteMany({ where: { analysisId } });
      await tx.analysisResult.create({
        data: {
          organizationId: req.auth.organizationId,
          analysisId,
          methodology: computed.methodology,
          statisticalResults: computed.results,
          interpretation: interp.interpretation,
          interpretationSource: interp.source,
          visualizationData: computed.visualizationData,
          assumptions: computed.assumptions,
          limitations,
        },
      });
      const done = await tx.analysis.update({
        where: { id: analysisId },
        data: {
          status: "COMPLETED",
          analysisType: planned.plan.analysisType,
          plan: { ...(analysis.plan?.requested ? { requested: analysis.plan.requested } : {}), resolved: planned.plan },
          planSource: planned.source,
          sourceStorageKey: storageKey,
        },
        include,
      });
      await audit.record(tx, {
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        action: "analysis.completed",
        resourceType: "analysis",
        resourceId: analysisId,
        metadata: { analysisType: planned.plan.analysisType, planSource: planned.source, interpretationSource: interp.source },
      });
      return view(done);
    });
  } catch (err) {
    const message = err instanceof AppError ? err.message : "The analysis could not be completed";
    if (!(err instanceof AppError)) logger.error("analysis_failed", { analysisId, name: err.name, message: err.message });
    return forRequest(req, async (tx) => {
      const failed = await tx.analysis.update({ where: { id: analysisId }, data: { status: "FAILED", errorMessage: message }, include });
      await audit.record(tx, {
        organizationId: req.auth.organizationId,
        userId: req.auth.userId,
        action: "analysis.failed",
        resourceType: "analysis",
        resourceId: analysisId,
      });
      return { ...view(failed), errorDetails: err instanceof AppError ? err.details ?? null : null };
    });
  }
}

async function create(req, { datasetId, question, plan }) {
  const analysis = await forRequest(req, async (tx) => {
    await datasets.findActive(tx, req, datasetId);
    const a = await tx.analysis.create({
      data: {
        organizationId: req.auth.organizationId,
        datasetId,
        userId: req.auth.userId,
        question,
        status: "PENDING",
        ...(plan ? { plan: { requested: plan }, planSource: "user", analysisType: plan.analysisType } : {}),
      },
    });
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "analysis.requested",
      resourceType: "analysis",
      resourceId: a.id,
      metadata: { datasetId, explicitPlan: Boolean(plan) },
    });
    return a;
  });
  return execute(req, analysis.id);
}

const list = (req, { limit, cursor, datasetId, status }) =>
  forRequest(req, async (tx) => {
    const rows = await tx.analysis.findMany({
      where: { organizationId: req.auth.organizationId, ...(datasetId ? { datasetId } : {}), ...(status ? { status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, fullName: true } }, dataset: { select: { id: true, name: true, status: true } } },
    });
    const more = rows.length > limit;
    const items = (more ? rows.slice(0, limit) : rows).map((a) => ({
      id: a.id,
      question: a.question,
      status: a.status,
      analysisType: a.analysisType,
      dataset: { id: a.dataset.id, name: a.dataset.name, deleted: a.dataset.status === "DELETED" },
      createdBy: a.user,
      createdAt: a.createdAt,
    }));
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  });

const get = (req, id) =>
  forRequest(req, async (tx) => {
    const a = await tx.analysis.findFirst({ where: { id, organizationId: req.auth.organizationId }, include });
    if (!a) throw notFound("Analysis");
    return view(a);
  });

async function retry(req, id) {
  const a = await forRequest(req, (tx) => tx.analysis.findFirst({ where: { id, organizationId: req.auth.organizationId } }));
  if (!a) throw notFound("Analysis");
  if (a.status !== "FAILED") throw badRequest("Only failed analyses can be retried");
  return execute(req, id);
}

module.exports = { create, list, get, retry, view };
