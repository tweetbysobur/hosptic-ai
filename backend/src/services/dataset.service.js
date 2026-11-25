const path = require("path");
const { randomUUID } = require("crypto");
const { withTenant } = require("../db/tenant");
const { getStorage, datasetKey } = require("../storage");
const { parseFile, detectFileType } = require("./file-parser");
const { buildQualityReport, profileTable } = require("../analytics/quality");
const { recordAudit } = require("./audit.service");
const { paginate, pageMeta } = require("../utils/http");
const { notFound, forbidden, unprocessable } = require("../utils/AppError");
const logger = require("../utils/logger");
const { isMissing } = require("../analytics/columns");

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
  uploadedById: d.uploadedById,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const columnView = (c) => ({
  name: c.columnName,
  position: c.position,
  inferredType: c.inferredType,
  missingCount: c.missingCount,
  uniqueCount: c.uniqueCount,
  isSensitive: c.isSensitive,
});

async function uploadDataset(auth, { buffer, originalName, name, description }) {
  const fileType = detectFileType(buffer, originalName);
  const table = await parseFile(buffer, fileType);
  const columns = profileTable(table);
  const quality = buildQualityReport(table, columns);

  const datasetId = randomUUID();
  const storageKey = datasetKey(auth.organizationId, datasetId, fileType === "CSV" ? "csv" : "xlsx");
  await getStorage().put(storageKey, buffer);

  try {
    const dataset = await withTenant(
      auth.organizationId,
      async (tx) => {
        const created = await tx.dataset.create({
          data: {
            id: datasetId,
            organizationId: auth.organizationId,
            uploadedById: auth.userId,
            name: name || path.parse(originalName).name.slice(0, 160),
            description: description || null,
            originalFileName: path.basename(originalName).slice(0, 255),
            storageKey,
            fileType,
            fileSize: buffer.length,
            rowCount: table.rowCount,
            columnCount: table.columnCount,
            status: "READY",
            qualityReport: quality,
          },
        });
        await tx.datasetColumn.createMany({
          data: columns.map((col, index) => ({
            organizationId: auth.organizationId,
            datasetId,
            position: index,
            columnName: col.columnName,
            inferredType: col.inferredType,
            missingCount: col.missingCount,
            uniqueCount: col.uniqueCount,
            isSensitive: col.isSensitive,
          })),
        });
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          action: "dataset.uploaded",
          resourceType: "Dataset",
          resourceId: datasetId,
          metadata: { fileType, rowCount: table.rowCount, columnCount: table.columnCount },
        });
        return created;
      },
      auth.userId
    );
    return { ...datasetView(dataset), columns: columns.map((c, i) => columnView({ ...c, position: i })), quality };
  } catch (err) {
    await getStorage().remove(storageKey).catch((cleanupErr) => logger.error("Orphan file cleanup failed", { message: cleanupErr.message }));
    throw err;
  }
}

async function listDatasets(auth, query) {
  const { page, pageSize, skip, take } = paginate(query);
  return withTenant(
    auth.organizationId,
    async (tx) => {
      const where = { organizationId: auth.organizationId, deletedAt: null };
      const [items, total] = await Promise.all([
        tx.dataset.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
        tx.dataset.count({ where }),
      ]);
      return { items: items.map(datasetView), meta: pageMeta({ page, pageSize }, total) };
    },
    auth.userId
  );
}

async function findActiveDataset(tx, auth, id) {
  const dataset = await tx.dataset.findFirst({
    where: { id, organizationId: auth.organizationId, deletedAt: null },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (!dataset) throw notFound("Dataset not found");
  return dataset;
}

async function getDataset(auth, id) {
  return withTenant(auth.organizationId, async (tx) => {
    const dataset = await findActiveDataset(tx, auth, id);
    return { ...datasetView(dataset), columns: dataset.columns.map(columnView) };
  }, auth.userId);
}

async function deleteDataset(auth, id) {
  const storageKey = await withTenant(auth.organizationId, async (tx) => {
    const dataset = await findActiveDataset(tx, auth, id);
    if (auth.role === "RESEARCHER" && dataset.uploadedById !== auth.userId) {
      throw forbidden("Researchers can delete only the datasets they uploaded");
    }
    await tx.dataset.update({
      where: { id: dataset.id },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "dataset.deleted",
      resourceType: "Dataset",
      resourceId: dataset.id,
    });
    return dataset.storageKey;
  }, auth.userId);

  // Analyses and reports are kept. Only the raw file is removed from storage.
  await getStorage().remove(storageKey).catch((err) => logger.error("Dataset file removal failed", { message: err.message }));
  return { id, deleted: true };
}

async function loadStoredTable(dataset) {
  const buffer = await getStorage().get(dataset.storageKey);
  return parseFile(buffer, dataset.fileType);
}

async function previewDataset(auth, id, limit) {
  const dataset = await withTenant(auth.organizationId, (tx) => findActiveDataset(tx, auth, id), auth.userId);
  if (dataset.status !== "READY") throw unprocessable("Dataset is not ready");
  const table = await loadStoredTable(dataset);
  const sensitive = new Set(dataset.columns.filter((c) => c.isSensitive).map((c) => c.columnName));
  const rows = [];
  for (let r = 0; r < Math.min(limit, table.rowCount); r += 1) {
    rows.push(
      Object.fromEntries(
        table.headers.map((h) => {
          const raw = table.df.column(h).values[r];
          if (sensitive.has(h)) return [h, "[masked]"];
          return [h, isMissing(raw) ? null : String(raw)];
        })
      )
    );
  }
  return { headers: table.headers, rows, maskedColumns: [...sensitive], totalRows: table.rowCount };
}

async function getQuality(auth, id) {
  return withTenant(auth.organizationId, async (tx) => {
    const dataset = await findActiveDataset(tx, auth, id);
    if (!dataset.qualityReport) throw notFound("Quality report not available");
    return { datasetId: dataset.id, ...dataset.qualityReport };
  }, auth.userId);
}

async function getDownloadUrl(auth, id) {
  const dataset = await withTenant(auth.organizationId, async (tx) => {
    const found = await findActiveDataset(tx, auth, id);
    await recordAudit(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "dataset.download_requested",
      resourceType: "Dataset",
      resourceId: found.id,
    });
    return found;
  }, auth.userId);
  const url = await getStorage().signedUrl(dataset.storageKey, 300);
  return { url, expiresInSeconds: 300 };
}

module.exports = {
  uploadDataset,
  listDatasets,
  getDataset,
  deleteDataset,
  previewDataset,
  getQuality,
  getDownloadUrl,
  loadStoredTable,
  findActiveDataset,
};
