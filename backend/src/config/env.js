// Validated environment configuration. The process exits on invalid config
// rather than running with unsafe defaults.
require("dotenv").config({ quiet: true });
const { z } = require("zod");

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    FRONTEND_URL: z.string().min(1),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_SECURE: bool,
    TRUST_PROXY: bool,

    ZAI_API_KEY: z.string().optional().default(""),
    ZAI_API_BASE_URL: z.string().url().default("https://api.z.ai/api/paas/v4"),
    ZAI_MODEL: z.string().default("glm-5.3"),
    ZAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

    STORAGE_DRIVER: z.enum(["s3", "local"]).default("s3"),
    STORAGE_ENDPOINT: z.string().optional().default(""),
    STORAGE_REGION: z.string().default("auto"),
    STORAGE_BUCKET: z.string().optional().default(""),
    STORAGE_ACCESS_KEY: z.string().optional().default(""),
    STORAGE_SECRET_KEY: z.string().optional().default(""),
    STORAGE_FORCE_PATH_STYLE: bool,
    STORAGE_LOCAL_DIR: z.string().default("./.storage"),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
    PUBLIC_API_URL: z.string().optional().default(""),

    MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(10),
    MAX_DATASET_ROWS: z.coerce.number().int().positive().default(200000),
    MAX_DATASET_COLUMNS: z.coerce.number().int().positive().default(300),
  })
  .superRefine((e, ctx) => {
    if (e.STORAGE_DRIVER === "s3") {
      for (const k of ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"]) {
        if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: "required when STORAGE_DRIVER=s3" });
      }
    }
    if (e.NODE_ENV === "production" && e.STORAGE_DRIVER === "local") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "local storage is not allowed in production" });
    }
    if (e.COOKIE_SAMESITE === "none" && e.COOKIE_SECURE === false && e.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "SameSite=None requires secure cookies" });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  // Print names only, never values.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === "production";
env.isTest = env.NODE_ENV === "test";
// Secure cookies by default in production, or whenever SameSite=None.
env.COOKIE_SECURE = env.isProd || env.COOKIE_SAMESITE === "none" ? true : env.COOKIE_SECURE;
env.aiConfigured = Boolean(env.ZAI_API_KEY);
env.allowedOrigins = env.FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean);

module.exports = env;
