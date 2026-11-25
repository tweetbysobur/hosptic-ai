const service = require("../services/dataset.service");
const { badRequest } = require("../utils/AppError");

const wrap = (fn, status = 200) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  upload: wrap((req) => {
    if (!req.file) throw badRequest("A file field named 'file' is required");
    return service.uploadDataset(req.auth, {
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      name: req.body.name,
      description: req.body.description,
    });
  }, 201),
  list: wrap((req) => service.listDatasets(req.auth, req.query)),
  get: wrap((req) => service.getDataset(req.auth, req.params.id)),
  remove: wrap((req) => service.deleteDataset(req.auth, req.params.id)),
  preview: wrap((req) => service.previewDataset(req.auth, req.params.id, req.query.limit)),
  quality: wrap((req) => service.getQuality(req.auth, req.params.id)),
  download: wrap((req) => service.getDownloadUrl(req.auth, req.params.id)),
};
