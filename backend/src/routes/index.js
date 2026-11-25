const router = require("express").Router();
const prisma = require("../config/prisma");
const env = require("../config/env");
const h = require("../utils/async-handler");

router.get(
  "/health",
  h(async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: "ok", ai: env.aiConfigured ? "configured" : "not_configured" } });
  })
);

router.use("/auth", require("./auth.routes"));
router.use("/organization", require("./organization.routes"));
router.use("/datasets", require("./dataset.routes"));
router.use("/analysis", require("./analysis.routes"));
router.use("/reports", require("./report.routes"));
router.use("/files", require("./files.routes"));

module.exports = router;
