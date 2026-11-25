const path = require("path");
const env = require("../config/env");
const { forRequest } = require("./tenant.service");
const audit = require("./audit.service");
const { storage, keys } = require("../storage");
const { detectFileType, parseDataset, parseCsv, toCsv } = require("../analytics/parse");
const { profileTable, isMissing } = require("../analytics/profile");
const { analyseQuality } = require("../analytics/quality");
const { applyOperations } = require("../analytics/cleaning");
const { uuid } = require("../utils/crypto");
const { notFound, badRequest, unprocessable, forbidden } = require("../utils/errors");
const logger = require("../utils/logger");

const CONTENT_TYPES = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
// Roles that may see identifier columns in previews. Others get them masked.
const UNMASKED_ROLES = new Set(["ORGANIZATION_ADMIN", "RESEARCHER"]);

function safeFileName(name) {
  return path
    .basename(String(name || "dataset"))
    .replace(/[\u0000-\u001f\u007f"\\/<>|:*?]/g, "_")
    .slice(0, 200);
}

const datasetView = (d) => ({
  id: d.id,
  name: d.name,
  description: d.description,
  originalFileName: d.originalFileName,
  fileType: d.fileType,
  fileSize: d.fileSize,
  rowCount: d.rowCount,
  columnCount: d.columnCount,
  status: d.status,
  hasProcessedVersion: Boolean(d.processedStorageKey),
  uploadedBy: d.uploadedBy ? { id: d.uploadedBy.id, fullName: d.uploadedBy.fullName } : null,
  qualitySummary: d.qualityReport
    ? {
        completeness: d.qualityReport.completeness,
        duplicateRows: d.qualityReport.duplicateRows,
        warningCount: d.qualityReport.warningCount,
      }
    : null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const columnView = (c) => ({
  name: c.columnName,
  position: c.position,
  type: c.inferredType,
  missingCount: c.missingCount,
  uniqueCount: c.uniqueCount,
  isSensitive: c.isSensitive,
  summary: c.metadata?.summary || null,
  levels: c.metadata?.levels || null,
  invalidCount: c.metadata?.invalidCount ?? 0,
});

async function findActive(tx, req, id) {
  const d = await tx.dataset.findFirst({
    where: { id, organizationId: req.auth.organizationId, status: { not: "DELETED" } },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
  if (!d) throw notFound("Dataset");
  return d;
}

// Loads the current version (processed if cleaning was applied) as a table.
async function loadTable(dataset, version = "current") {
  const useProcessed = version !== "original" && dataset.processedStorageKey;
  const key = useProcessed ? dataset.processedStorageKey : dataset.storageKey;
  const buf = await storage().get(key);
  const table = useProcessed ? parseCsv(buf) : await parseDataset(buf, dataset.fileType);
  return { table, storageKey: key };
}

function columnRows(organizationId, datasetId, profile) {
  return profile.map((c) => ({
    organizationId,
    datasetId,
    position: c.position,
    columnName: c.columnName,
    inferredType: c.inferredType,
    missingCount: c.missingCount,
    uniqueCount: c.uniqueCount,
    isSensitive: c.isSensitive,
    metadata: c.metadata,
  }));
}

async function upload(req, { name, description }) {
  if (!req.file) throw badRequest('Attach a CSV or XLSX file in the "file" field');
  const originalFileName = safeFileName(req.file.originalname);
  const fileType = detectFileType(req.file.buffer, originalFileName);
  // Parsing validates structure and limits before anything is stored.
  const table = await parseDataset(req.file.buffer, fileType);
  const profile = profileTable(table);
  const quality = analyseQuality(table, profile);

  const organizationId = req.auth.organizationId;
  const id = uuid();
  const storageKey = keys.datasetOriginal(organizationId, id, fileType);
  await storage().put(storageKey, req.file.buffer, CONTENT_TYPES[fileType]);

  try {
    return await forRequest(req, async (tx) => {
      const dataset = await tx.dataset.create({
        data: {
          id,
          organizationId,
          uploadedById: req.auth.userId,
          name: name || originalFileName.replace(/\.(csv|xlsx)$/i, ""),
          description: description || null,
          originalFileName,
          storageKey,
          fileType,
          fileSize: req.file.size,
          rowCount: table.rows.length,
          columnCount: table.columns.length,
          status: "READY",
          qualityReport: quality,
        },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      });
      await tx.datasetColumn.createMany({ data: columnRows(organizationId, id, profile) });
      await audit.record(tx, {
        organizationId,
        userId: req.auth.userId,
        action: "dataset.uploaded",
        resourceType: "dataset",
        resourceId: id,
        metadata: { fileType, fileSize: req.file.size, rows: table.rows.length, columns: table.columns.length },
      });
      return { ...datasetView(dataset), columns: profile.map((c) => columnView({ ...c })) };
    });
  } catch (err) {
    await storage().remove(storageKey).catch(() => logger.warn("orphan_cleanup_failed", { datasetId: id }));
    throw err;
  }
}

const list = (req, { limit, cursor }) =>
  forRequest(req, async (tx) => {
    const rows = await tx.dataset.findMany({
      where: { organizationId: req.auth.organizationId, status: { not: "DELETED" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    const more = rows.length > limit;
    const items = (more ? rows.slice(0, limit) : rows).map(datasetView);
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  });

const get = (req, id) =>
  forRequest(req, async (tx) => {
    const d = await findActive(tx, req, id);
    const columns = await tx.datasetColumn.findMany({ where: { datasetId: id }, orderBy: { position: "asc" } });
    const transformations = await tx.datasetTransformation.findMany({
      where: { datasetId: id },
      orderBy: { createdAt: "asc" },
      include: { appliedBy: { select: { id: true, fullName: true } } },
    });
    return {
      ...datasetView(d),
      columns: columns.map(columnView),
      transformations: transformations.map((t) => ({
        id: t.id,
        operations: t.operations,
        rowCountBefore: t.rowCountBefore,
        rowCountAfter: t.rowCountAfter,
        appliedBy: t.appliedBy,
        createdAt: t.createdAt,
      })),
    };
  });

async function preview(req, id, { limit, version }) {
  const { dataset, columns } = await forRequest(req, async (tx) => ({
    dataset: await findActive(tx, req, id),
    columns: await tx.datasetColumn.findMany({ where: { datasetId: id }, orderBy: { position: "asc" } }),
  }));
  if (version === "processed" && !dataset.processedStorageKey) throw badRequest("This dataset has no processed version");
  const { table } = await loadTable(dataset, version === "original" ? "original" : "current");
  const sensitive = new Set(columns.filter((c) => c.isSensitive).map((c) => c.columnName));
  const mask = !UNMASKED_ROLES.has(req.auth.role);
  const masked = mask ? table.columns.map((c) => sensitive.has(c)) : table.columns.map(() => false);
  return {
    version: version === "original" || !dataset.processedStorageKey ? "original" : "processed",
    columns: table.columns,
    rows: table.rows.slice(0, limit).map((r) => r.map((v, i) => (masked[i] && !isMissing(v) ? "***" : v))),
    totalRows: table.rows.length,
    maskedColumns: table.columns.filter((_, i) => masked[i]),
  };
}

const quality = (req, id) =>
  forRequest(req, async (tx) => {
    const d = await findActive(tx, req, id);
    return d.qualityReport;
  });

async function clean(req, id, operations) {
  const dataset = await forRequest(req, (tx) => findActive(tx, req, id));
  const { table, storageKey: inputKey } = await loadTable(dataset);
  const { table: result, log } = applyOperations(table, operations);
  const profile = profileTable(result);
  const report = analyseQuality(result, profile);

  const organizationId = req.auth.organizationId;
  const transformationId = uuid();
  const outputKey = keys.datasetProcessed(organizationId, id, transformationId);
  await storage().put(outputKey, Buffer.from(toCsv(result), "utf8"), CONTENT_TYPES.csv);

  try {
    return await forRequest(req, async (tx) => {
      const t = await tx.datasetTransformation.create({
        data: {
          id: transformationId,
          organizationId,
          datasetId: id,
          appliedById: req.auth.userId,
          operations,
          summary: log,
          inputStorageKey: inputKey,
          outputStorageKey: outputKey,
          rowCountBefore: table.rows.length,
          rowCountAfter: result.rows.length,
        },
      });
      await tx.dataset.update({
        where: { id },
        data: { processedStorageKey: outputKey, rowCount: result.rows.length, columnCount: result.columns.length, qualityReport: report },
      });
      await tx.datasetColumn.deleteMany({ where: { datasetId: id } });
      await tx.datasetColumn.createMany({ data: columnRows(organizationId, id, profile) });
      await audit.record(tx, {
        organizationId,
        userId: req.auth.userId,
        action: "dataset.cleaned",
        resourceType: "dataset",
        resourceId: id,
        metadata: { transformationId, operations: operations.map((o) => o.op), rowsBefore: table.rows.length, rowsAfter: result.rows.length },
      });
      return {
        transformation: { id: t.id, operations: log, rowCountBefore: t.rowCountBefore, rowCountAfter: t.rowCountAfter, createdAt: t.createdAt },
        quality: report,
        columns: profile.map(columnView),
      };
    });
  } catch (err) {
    await storage().remove(outputKey).catch(() => {});
    throw err;
  }
}

// Reverts to the original upload. Transformation history is kept.
async function resetToOriginal(req, id) {
  const dataset = await forRequest(req, (tx) => findActive(tx, req, id));
  if (!dataset.processedStorageKey) throw badRequest("The dataset is already at its original version");
  const { table } = await loadTable(dataset, "original");
  const profile = profileTable(table);
  const report = analyseQuality(table, profile);
  return forRequest(req, async (tx) => {
    await tx.dataset.update({
      where: { id },
      data: { processedStorageKey: null, rowCount: table.rows.length, columnCount: table.columns.length, qualityReport: report },
    });
    await tx.datasetColumn.deleteMany({ where: { datasetId: id } });
    await tx.datasetColumn.createMany({ data: columnRows(req.auth.organizationId, id, profile) });
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "dataset.reset_to_original",
      resourceType: "dataset",
      resourceId: id,
    });
    return { reset: true };
  });
}

async function downloadUrl(req, id, version) {
  const d = await forRequest(req, async (tx) => {
    const row = await findActive(tx, req, id);
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "dataset.download_link_created",
      resourceType: "dataset",
      resourceId: id,
      metadata: { version },
    });
    return row;
  });
  const processed = version === "processed";
  if (processed && !d.processedStorageKey) throw badRequest("This dataset has no processed version");
  const key = processed ? d.processedStorageKey : d.storageKey;
  if (!keys.belongsTo(key, req.auth.organizationId)) throw notFound("Dataset");
  const base = d.originalFileName.replace(/\.(csv|xlsx)$/i, "");
  const fileName = processed ? `${base}-processed.csv` : d.originalFileName;
  const url = await storage().signedUrl(key, { fileName, contentType: processed ? CONTENT_TYPES.csv : CONTENT_TYPES[d.fileType] });
  return { url, expiresInSeconds: env.SIGNED_URL_TTL_SECONDS, fileName };
}

// Soft delete. Files are removed from storage; analyses and reports that used
// the dataset stay intact because their results are stored separately.
async function remove(req, id) {
  const d = await forRequest(req, async (tx) => {
    const row = await findActive(tx, req, id);
    if (req.auth.role === "RESEARCHER" && row.uploadedById !== req.auth.userId) {
      throw forbidden("Researchers can only delete datasets they uploaded");
    }
    const transformations = await tx.datasetTransformation.findMany({ where: { datasetId: id }, select: { outputStorageKey: true } });
    await tx.dataset.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date(), processedStorageKey: null } });
    const analyses = await tx.analysis.count({ where: { datasetId: id } });
    await audit.record(tx, {
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: "dataset.deleted",
      resourceType: "dataset",
      resourceId: id,
      metadata: { analysesRetained: analyses },
    });
    return { row, transformations, analyses };
  });
  const objects = [d.row.storageKey, ...d.transformations.map((t) => t.outputStorageKey)];
  for (const key of objects) await storage().remove(key).catch(() => logger.warn("storage_delete_failed", { datasetId: id }));
  return { deleted: true, analysesRetained: d.analyses };
}

// Profile rows used by the analysis planner.
const profileFor = (tx, datasetId) =>
  tx.datasetColumn.findMany({ where: { datasetId }, orderBy: { position: "asc" } });

function ensureReady(dataset) {
  if (dataset.status !== "READY") throw unprocessable(`Dataset is ${dataset.status.toLowerCase()} and cannot be analysed`);
}

module.exports = {
  upload,
  list,
  get,
  preview,
  quality,
  clean,
  resetToOriginal,
  downloadUrl,
  remove,
  loadTable,
  findActive,
  profileFor,
  ensureReady,
  CONTENT_TYPES,
};
