const datasets = require("../services/dataset.service");
const { ok, created } = require("../utils/respond");

exports.upload = async (req, res) => created(res, await datasets.upload(req, req.body));
exports.list = async (req, res) => ok(res, await datasets.list(req, req.validatedQuery));
exports.get = async (req, res) => ok(res, await datasets.get(req, req.params.id));
exports.preview = async (req, res) => ok(res, await datasets.preview(req, req.params.id, req.validatedQuery));
exports.quality = async (req, res) => ok(res, await datasets.quality(req, req.params.id));
exports.clean = async (req, res) => created(res, await datasets.clean(req, req.params.id, req.body.operations));
exports.reset = async (req, res) => ok(res, await datasets.resetToOriginal(req, req.params.id));
exports.download = async (req, res) => ok(res, await datasets.downloadUrl(req, req.params.id, req.validatedQuery.version));
exports.remove = async (req, res) => ok(res, await datasets.remove(req, req.params.id));
