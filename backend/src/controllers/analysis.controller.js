const analyses = require("../services/analysis.service");
const { ok, created } = require("../utils/respond");

// A completed or failed analysis is a created resource either way; the
// status field says which.
exports.create = async (req, res) => created(res, await analyses.create(req, req.body));
exports.list = async (req, res) => ok(res, await analyses.list(req, req.validatedQuery));
exports.get = async (req, res) => ok(res, await analyses.get(req, req.params.id));
exports.retry = async (req, res) => ok(res, await analyses.retry(req, req.params.id));
