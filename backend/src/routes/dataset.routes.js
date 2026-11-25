const express = require("express");
const controller = require("../controllers/dataset.controller");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middleware/rbac");
const { validate } = require("../middleware/validate");
const { singleDatasetFile } = require("../middleware/upload");
const v = require("../validators/dataset.validator");

const router = express.Router();
router.use(authenticate);

router.post("/upload", requirePermission("datasets:upload"), singleDatasetFile, validate(v.uploadFieldsSchema), controller.upload);
router.get("/", requirePermission("datasets:read"), validate(v.listQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("datasets:read"), validate(v.idParams, "params"), controller.get);
router.delete("/:id", requirePermission("datasets:delete"), validate(v.idParams, "params"), controller.remove);
router.get(
  "/:id/preview",
  requirePermission("datasets:preview"),
  validate(v.idParams, "params"),
  validate(v.previewQuerySchema, "query"),
  controller.preview
);
router.get("/:id/quality", requirePermission("datasets:read"), validate(v.idParams, "params"), controller.quality);
router.get("/:id/download", requirePermission("datasets:download"), validate(v.idParams, "params"), controller.download);

module.exports = router;
