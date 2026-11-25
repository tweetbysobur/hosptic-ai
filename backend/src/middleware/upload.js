const multer = require("multer");
const env = require("../config/env");

// Files are held in memory, validated by content, then written to private
// object storage. Nothing touches the local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5, fieldSize: 2000 },
});

module.exports = { singleDataset: upload.single("file") };
