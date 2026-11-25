const router = require("express").Router();
const c = require("../controllers/auth.controller");
const v = require("../validators/auth.validators");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rate-limit");
const h = require("../utils/async-handler");

router.get("/csrf", c.csrf);
router.post("/register", authLimiter, validate(v.register), h(c.register));
router.post("/login", authLimiter, validate(v.login), h(c.login));
router.post("/refresh", authLimiter, h(c.refresh));
router.post("/logout", authenticate, h(c.logout));
router.get("/me", authenticate, h(c.me));
router.post("/accept-invite", authLimiter, validate(v.acceptInvite), h(c.acceptInvite));

module.exports = router;
