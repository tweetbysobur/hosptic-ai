const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const swaggerUi = require("swagger-ui-express");
const { env } = require("./config/env");
const apiRoutes = require("./routes");
const { apiLimiter } = require("./middleware/rateLimit");
const { csrfProtection } = require("./middleware/csrf");
const { errorHandler, notFoundHandler } = require("./middleware/error");

function loadOpenApiDocument() {
  const file = path.resolve(__dirname, "../../shared/contracts/openapi.yaml");
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Requests without an Origin header (server-to-server, curl) are not browser requests.
        if (!origin || env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter);
  app.use("/api/v1", csrfProtection);

  if (env.NODE_ENV !== "production") {
    app.get("/api/docs.json", (req, res) => res.json(loadOpenApiDocument()));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(loadOpenApiDocument()));
  }

  app.use("/api/v1", apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
