const router = require("express").Router();
const c = require("../controllers/dataset.controller");
const v = require("../validators/dataset.validators");
const { idParams, pagination } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission: perm } = require("../middleware/rbac");
const { singleDataset } = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rate-limit");
const h = require("../utils/async-handler");

const id = validate(idParams, "params");

router.use(authenticate);
router.post("/upload", perm("dataset:upload"), uploadLimiter, singleDataset, validate(v.uploadFields), h(c.upload));
router.get("/", perm("dataset:read"), validate(pagination, "query"), h(c.list));
router.get("/:id", perm("dataset:read"), id, h(c.get));
router.get("/:id/preview", perm("dataset:read"), id, validate(v.preview, "query"), h(c.preview));
router.get("/:id/quality", perm("dataset:read"), id, h(c.quality));
router.get("/:id/download", perm("dataset:download"), id, validate(v.download, "query"), h(c.download));
router.post("/:id/clean", perm("dataset:clean"), id, validate(v.clean), h(c.clean));
router.post("/:id/reset", perm("dataset:clean"), id, h(c.reset));
router.delete("/:id", perm("dataset:delete"), id, h(c.remove));

module.exports = router;
