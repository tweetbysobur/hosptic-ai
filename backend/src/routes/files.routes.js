// Serves signed download links for the local storage driver (development and
// tests). With S3 storage, clients download directly from presigned URLs.
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { storage, keys } = require("../storage");
const { notFound } = require("../utils/errors");
const h = require("../utils/async-handler");

router.get(
  "/:token",
  authenticate,
  h(async (req, res) => {
    const driver = storage();
    if (driver.name !== "local") throw notFound("File");
    const data = driver.verifyToken(req.params.token);
    // The link must be valid and the file must belong to the caller's organisation.
    if (!data || !keys.belongsTo(data.k, req.auth.organizationId)) throw notFound("File");
    const body = await driver.get(data.k).catch(() => null);
    if (!body) throw notFound("File");
    res.setHeader("Content-Type", data.t);
    res.setHeader("Content-Disposition", `attachment; filename="${data.n.replace(/["\\\r\n]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(body);
  })
);

module.exports = router;
