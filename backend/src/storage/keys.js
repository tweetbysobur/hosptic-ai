// Storage key layout. Every object lives under its organisation's prefix.
// Keys are internal and never returned to clients.
const ext = (fileType) => (fileType === "xlsx" ? "xlsx" : "csv");

module.exports = {
  datasetOriginal: (orgId, datasetId, fileType) => `organizations/${orgId}/datasets/${datasetId}/original.${ext(fileType)}`,
  datasetProcessed: (orgId, datasetId, transformationId) =>
    `organizations/${orgId}/datasets/${datasetId}/processed/${transformationId}.csv`,
  report: (orgId, reportId) => `organizations/${orgId}/reports/${reportId}.pdf`,
  belongsTo: (key, orgId) => typeof key === "string" && key.startsWith(`organizations/${orgId}/`),
};
