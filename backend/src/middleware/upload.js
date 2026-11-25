const multer = require("multer");
const { env } = require("../config/env");
const { badRequest } = require("../utils/AppError");

// Files are held in memory only long enough to validate and store them. Nothing is written to local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "xlsx") {
      return cb(badRequest("Unsupported file type. Upload a .csv or .xlsx file."));
    }
    return cb(null, true);
  },
});

module.exports = { singleDatasetFile: upload.single("file") };
