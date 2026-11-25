// Express application. Kept separate from server.js so tests can mount it
// with Supertest without opening a port.
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./config/env");
const routes = require("./routes");
const { requestContext } = require("./middleware/request-context");
const { csrfProtection } = require("./middleware/csrf");
const { globalLimiter } = require("./middleware/rate-limit");
const { notFoundHandler, errorHandler } = require("./middleware/error");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Requests without an Origin (curl, server-to-server) carry no browser cookies risk.
        if (!origin || env.allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    })
  );
  app.use(globalLimiter);
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  // API docs: always in development; in production only when ENABLE_API_DOCS=true.
  if (!env.isProd || process.env.ENABLE_API_DOCS === "true") {
    const swaggerUi = require("swagger-ui-express");
    const spec = require("./docs/openapi");
    app.get("/api/v1/openapi.json", (req, res) => res.json(spec));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "Hosptic AI API" }));
  }
  app.use("/api/v1", csrfProtection, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
