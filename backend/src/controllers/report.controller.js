const service = require("../services/report.service");

const wrap = (fn, status = 200) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create: wrap((req) => service.createReport(req.auth, req.body), 201),
  list: wrap((req) => service.listReports(req.auth, req.query)),
  get: wrap((req) => service.getReport(req.auth, req.params.id)),
  download: async (req, res, next) => {
    try {
      const { buffer, filename } = await service.downloadReport(req.auth, req.params.id);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  },
};
