// Test environment. Uses a separate database (hosptic_test) and local storage.
// Override with TEST_DATABASE_URL / TEST_DIRECT_URL in CI.
const path = require("path");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://hosptic_app:app_dev_pw@localhost:5432/hosptic_test";
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL || "postgresql://hosptic_owner:owner_dev_pw@localhost:5432/hosptic_test";
process.env.JWT_SECRET = "test_secret_value_that_is_long_enough_0123456789";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = path.join(__dirname, "..", ".storage-test");
// A key is set so AI code paths run; tests replace the HTTP transport, so no
// request ever reaches Z.ai.
process.env.ZAI_API_KEY = "test-key";
process.env.ZAI_API_BASE_URL = "https://api.z.ai/api/paas/v4";
process.env.ZAI_MODEL = "glm-5.3";
