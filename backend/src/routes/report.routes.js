const router = require("express").Router();
const c = require("../controllers/report.controller");
const v = require("../validators/report.validators");
const { idParams } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission: perm } = require("../middleware/rbac");
const h = require("../utils/async-handler");

const id = validate(idParams, "params");

router.use(authenticate);
router.post("/", perm("report:create"), validate(v.create), h(c.create));
router.get("/", perm("report:read"), validate(v.list, "query"), h(c.list));
router.get("/:id", perm("report:read"), id, h(c.get));
router.get("/:id/download", perm("report:read"), id, h(c.download));

module.exports = router;
