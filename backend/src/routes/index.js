const express = require("express");
const authRoutes = require("./auth.routes");
const organizationRoutes = require("./organization.routes");
const datasetRoutes = require("./dataset.routes");
const analysisRoutes = require("./analysis.routes");
const reportRoutes = require("./report.routes");

const router = express.Router();
router.get("/health", (req, res) => res.json({ success: true, data: { status: "ok" } }));
router.use("/auth", authRoutes);
router.use("/organization", organizationRoutes);
router.use("/datasets", datasetRoutes);
router.use("/analysis", analysisRoutes);
router.use("/reports", reportRoutes);

module.exports = router;
