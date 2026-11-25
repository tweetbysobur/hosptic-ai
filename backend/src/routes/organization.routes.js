const router = require("express").Router();
const c = require("../controllers/organization.controller");
const v = require("../validators/organization.validators");
const { idParams, pagination } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission: perm } = require("../middleware/rbac");
const h = require("../utils/async-handler");

router.use(authenticate);
router.get("/", perm("organization:read"), h(c.get));
router.patch("/", perm("organization:update"), validate(v.update), h(c.update));
router.get("/members", perm("members:read"), h(c.listMembers));
router.post("/members/invite", perm("members:manage"), validate(v.invite), h(c.invite));
router.patch("/members/:id", perm("members:manage"), validate(idParams, "params"), validate(v.updateMember), h(c.updateMember));
router.delete("/members/:id", perm("members:manage"), validate(idParams, "params"), h(c.removeMember));
router.get("/audit-logs", perm("audit:read"), validate(pagination, "query"), h(c.auditLogs));

module.exports = router;
