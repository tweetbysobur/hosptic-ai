const express = require("express");
const controller = require("../controllers/organization.controller");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const v = require("../validators/organization.validator");

const router = express.Router();
router.use(authenticate);

router.get("/", requirePermission("org:read"), controller.get);
router.patch("/", requirePermission("org:update"), validate(v.updateOrganizationSchema), controller.update);
router.get("/members", requirePermission("members:read"), controller.listMembers);
router.post("/members/invite", requirePermission("members:manage"), validate(v.inviteSchema), controller.invite);
router.patch(
  "/members/:id",
  requirePermission("members:manage"),
  validate(v.memberIdParams, "params"),
  validate(v.updateMemberSchema),
  controller.updateMember
);
router.delete(
  "/members/:id",
  requirePermission("members:manage"),
  validate(v.memberIdParams, "params"),
  controller.removeMember
);

module.exports = router;
