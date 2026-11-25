const reports = require("../services/report.service");
const { ok, created } = require("../utils/respond");

exports.create = async (req, res) => created(res, await reports.create(req, req.body));
exports.list = async (req, res) => ok(res, await reports.list(req, req.validatedQuery));
exports.get = async (req, res) => ok(res, await reports.get(req, req.params.id));
exports.download = async (req, res) => ok(res, await reports.downloadUrl(req, req.params.id));
