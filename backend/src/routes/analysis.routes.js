const express = require("express");
const controller = require("../controllers/analysis.controller");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const v = require("../validators/analysis.validator");

const router = express.Router();
router.use(authenticate);

router.post("/", requirePermission("analysis:create"), validate(v.createAnalysisSchema), controller.create);
router.get("/", requirePermission("analysis:read"), validate(v.listAnalysisQuery, "query"), controller.list);
router.get("/:id", requirePermission("analysis:read"), validate(v.idParams, "params"), controller.get);
router.post("/:id/retry", requirePermission("analysis:create"), validate(v.idParams, "params"), controller.retry);

module.exports = router;
