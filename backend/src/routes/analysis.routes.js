const router = require("express").Router();
const c = require("../controllers/analysis.controller");
const v = require("../validators/analysis.validators");
const { idParams } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission: perm } = require("../middleware/rbac");
const { analysisLimiter } = require("../middleware/rate-limit");
const h = require("../utils/async-handler");

router.use(authenticate);
router.post("/", perm("analysis:create"), analysisLimiter, validate(v.create), h(c.create));
router.get("/", perm("analysis:read"), validate(v.list, "query"), h(c.list));
router.get("/:id", perm("analysis:read"), validate(idParams, "params"), h(c.get));
router.post("/:id/retry", perm("analysis:create"), analysisLimiter, validate(idParams, "params"), h(c.retry));

module.exports = router;
