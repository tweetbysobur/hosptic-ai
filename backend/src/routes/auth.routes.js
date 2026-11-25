const express = require("express");
const controller = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");
const { registerSchema, loginSchema } = require("../validators/auth.validator");

const router = express.Router();

router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/logout", controller.logout);
router.post("/refresh", authLimiter, controller.refresh);
router.get("/me", authenticate, controller.me);

module.exports = router;
