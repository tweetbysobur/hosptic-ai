const service = require("../services/organization.service");

const wrap = (fn, status = 200) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  get: wrap((req) => service.getOrganization(req.auth)),
  update: wrap((req) => service.updateOrganization(req.auth, req.body)),
  listMembers: wrap((req) => service.listMembers(req.auth)),
  invite: wrap((req) => service.inviteMember(req.auth, req.body), 201),
  updateMember: wrap((req) => service.updateMember(req.auth, req.params.id, req.body)),
  removeMember: wrap((req) => service.removeMember(req.auth, req.params.id)),
};
