const org = require("../services/organization.service");
const { ok, created } = require("../utils/respond");

exports.get = async (req, res) => ok(res, await org.get(req));
exports.update = async (req, res) => ok(res, await org.update(req, req.body));
exports.listMembers = async (req, res) => ok(res, await org.listMembers(req));
exports.invite = async (req, res) => created(res, await org.invite(req, req.body));
exports.updateMember = async (req, res) => ok(res, await org.updateMember(req, req.params.id, req.body));
exports.removeMember = async (req, res) => {
  await org.removeMember(req, req.params.id);
  ok(res, { removed: true });
};
exports.auditLogs = async (req, res) => ok(res, await org.auditLogs(req, req.validatedQuery));
