const express = require("express");
const controller = require("../controllers/report.controller");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const v = require("../validators/report.validator");

const router = express.Router();
router.use(authenticate);

router.post("/", requirePermission("reports:create"), validate(v.createReportSchema), controller.create);
router.get("/", requirePermission("reports:read"), validate(v.listReportQuery, "query"), controller.list);
router.get("/:id", requirePermission("reports:read"), validate(v.idParams, "params"), controller.get);
router.get("/:id/download", requirePermission("reports:read"), validate(v.idParams, "params"), controller.download);

module.exports = router;
