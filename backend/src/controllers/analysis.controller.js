const service = require("../services/analysis.service");

const wrap = (fn, status = 200) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create: wrap((req) => service.createAnalysis(req.auth, req.body), 201),
  list: wrap((req) => service.listAnalyses(req.auth, req.query)),
  get: wrap((req) => service.getAnalysis(req.auth, req.params.id)),
  retry: wrap((req) => service.retryAnalysis(req.auth, req.params.id)),
};
