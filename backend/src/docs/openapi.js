// OpenAPI 3.1 description of the Hosptic AI API. Exported to
// shared/contracts/openapi.json with `npm run docs:export`.
const { ANALYSIS_TYPES } = require("../analytics/plan");
const { PERMISSIONS, ROLES } = require("../config/permissions");

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema, description = "Success") => ({
  description,
  content: { "application/json": { schema: { type: "object", required: ["success", "data"], properties: { success: { const: true }, data: schema } } } },
});
const body = (schema, type = "application/json") => ({ required: true, content: { [type]: { schema } } });
const err = (codes) =>
  Object.fromEntries(
    codes.map((c) => [
      c,
      {
        description: {
          400: "Invalid input",
          401: "Not signed in or session expired",
          403: "Missing permission or invalid CSRF token",
          404: "Not found, or belongs to another organisation",
          409: "Conflict",
          413: "File too large",
          422: "Valid request that cannot be processed (bad file, incompatible columns, ...)",
          429: "Rate limited",
        }[c],
        content: { "application/json": { schema: ref("Error") } },
      },
    ])
  );
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const page = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
  { name: "cursor", in: "query", schema: { type: "string", format: "uuid" }, description: "nextCursor from the previous page" },
];
const roles = (perm) => `Roles: ${PERMISSIONS[perm].join(", ")}.`;
const auth = [{ cookieAuth: [] }];
const authCsrf = [{ cookieAuth: [], csrfToken: [] }];
const paged = (item) => ({ type: "object", properties: { items: { type: "array", items: item }, nextCursor: { type: ["string", "null"] } } });

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Hosptic AI API",
    version: "0.1.0",
    description: [
      "Backend for Hosptic AI, a multi-tenant healthcare data analysis platform.",
      "",
      "Authentication uses HTTP-only cookies (`hosptic_access`, `hosptic_refresh`). Browsers must send requests with `credentials: \"include\"`.",
      "Every POST, PATCH and DELETE needs the `X-CSRF-Token` header. Get a token from `GET /api/v1/auth/csrf` (also returned by register, login and accept-invite).",
      "",
      "The organisation is always resolved from the signed-in user's membership. Never send an organizationId.",
      "Resources from another organisation return 404.",
      "",
      "All responses use `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.",
    ].join("\n"),
  },
  servers: [{ url: "/" }],
  tags: ["Auth", "Organization", "Datasets", "Analysis", "Reports", "Files", "System"].map((name) => ({ name })),
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "hosptic_access" },
      csrfToken: { type: "apiKey", in: "header", name: "X-CSRF-Token" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { const: false },
          error: {
            type: "object",
            properties: { code: { type: "string" }, message: { type: "string" }, details: {}, requestId: { type: "string" } },
          },
        },
      },
      Role: { type: "string", enum: ROLES },
      User: { type: "object", properties: { id: { type: "string" }, fullName: { type: "string" }, email: { type: "string" } } },
      Organization: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
          email: { type: "string" },
          aiProcessingEnabled: { type: "boolean" },
          aiProcessingUpdatedAt: { type: ["string", "null"], format: "date-time" },
          aiDisclosure: { type: "object", description: "Text to show before an admin enables external AI processing." },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Member: {
        type: "object",
        properties: { id: { type: "string" }, role: ref("Role"), status: { enum: ["ACTIVE", "INVITED", "SUSPENDED"] }, user: ref("User"), createdAt: { type: "string" } },
      },
      Column: {
        type: "object",
        properties: {
          name: { type: "string" },
          position: { type: "integer" },
          type: { enum: ["numeric", "categorical", "boolean", "date", "text", "identifier", "empty"] },
          missingCount: { type: "integer" },
          uniqueCount: { type: "integer" },
          isSensitive: { type: "boolean", description: "Looks like a patient identifier. Excluded from AI and analysis." },
          invalidCount: { type: "integer" },
          summary: { type: ["object", "null"] },
          levels: { type: ["array", "null"], items: { type: "object", properties: { value: { type: "string" }, count: { type: "integer" } } } },
        },
      },
      Dataset: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          originalFileName: { type: "string" },
          fileType: { enum: ["csv", "xlsx"] },
          fileSize: { type: "integer" },
          rowCount: { type: "integer" },
          columnCount: { type: "integer" },
          status: { enum: ["UPLOADED", "PROCESSING", "READY", "FAILED"] },
          hasProcessedVersion: { type: "boolean" },
          qualitySummary: { type: ["object", "null"], properties: { completeness: { type: "number" }, duplicateRows: { type: "integer" }, warningCount: { type: "integer" } } },
          uploadedBy: { type: ["object", "null"] },
          createdAt: { type: "string" },
        },
      },
      QualityReport: {
        type: "object",
        properties: {
          rowCount: { type: "integer" },
          columnCount: { type: "integer" },
          duplicateRows: { type: "integer" },
          missingCells: { type: "integer" },
          completeness: { type: "number" },
          warningCount: { type: "integer" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { enum: ["duplicate_rows", "missing_values", "invalid_numeric", "potential_outliers", "implausible_values", "inconsistent_labels", "inconsistent_dates", "unexpected_type", "possible_identifier", "ragged_rows"] },
                severity: { enum: ["info", "warning"] },
                column: { type: "string" },
                count: { type: "integer" },
                message: { type: "string" },
              },
            },
          },
          recommendations: { type: "array", items: { type: "object", properties: { operation: ref("CleaningOperation"), reason: { type: "string" } } } },
        },
      },
      CleaningOperation: {
        oneOf: [
          { type: "object", required: ["op"], properties: { op: { const: "drop_duplicates" } } },
          { type: "object", required: ["op"], properties: { op: { const: "drop_missing" }, columns: { type: "array", items: { type: "string" } } } },
          { type: "object", required: ["op", "column", "strategy"], properties: { op: { const: "fill_missing" }, column: { type: "string" }, strategy: { enum: ["mean", "median", "mode", "constant"] }, value: {} } },
          { type: "object", required: ["op"], properties: { op: { const: "trim_whitespace" }, columns: { type: "array", items: { type: "string" } } } },
          { type: "object", required: ["op", "column"], properties: { op: { const: "standardize_labels" }, column: { type: "string" }, mapping: { type: "object", additionalProperties: { type: "string" } } } },
          { type: "object", required: ["op", "column"], properties: { op: { const: "coerce_numeric" }, column: { type: "string" } } },
          { type: "object", required: ["op", "column"], properties: { op: { const: "remove_outliers" }, column: { type: "string" }, method: { const: "iqr" }, k: { type: "number", default: 1.5 } } },
          { type: "object", required: ["op", "columns"], properties: { op: { const: "drop_columns" }, columns: { type: "array", items: { type: "string" } } } },
          { type: "object", required: ["op", "column"], properties: { op: { const: "parse_dates" }, column: { type: "string" }, dayFirst: { type: "boolean", default: true } } },
        ],
      },
      AnalysisPlan: {
        type: "object",
        required: ["analysisType", "variables"],
        properties: {
          analysisType: { enum: ANALYSIS_TYPES },
          variables: {
            type: "object",
            properties: { outcome: { type: "string" }, predictor: { type: "string" }, group: { type: "string" }, columns: { type: "array", items: { type: "string" }, maxItems: 10 } },
          },
          groupLevels: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
        },
      },
      Assumption: { type: "object", properties: { name: { type: "string" }, status: { enum: ["met", "violated", "caution", "not_checked"] }, detail: { type: "string" } } },
      Analysis: {
        type: "object",
        properties: {
          id: { type: "string" },
          datasetId: { type: "string" },
          status: { enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] },
          question: { type: "string" },
          analysisType: { type: ["string", "null"], enum: [...ANALYSIS_TYPES, null] },
          planSource: { type: ["string", "null"], enum: ["user", "zai", "zai_corrected", "keyword_match", null] },
          methodology: { type: ["object", "null"], description: "test, description, variables, alpha, missingData, planNotes, planSource, datasetVersion, externalAiUsed" },
          results: { type: ["object", "null"], description: "Only the metrics that apply to the test: sampleSize, testStatistic, degreesOfFreedom, pValue, confidenceInterval95, effectSize, significantAtAlpha, plus test-specific fields." },
          interpretation: { type: ["string", "null"] },
          interpretationSource: { type: ["string", "null"], enum: ["zai", "deterministic", "deterministic_fallback", null] },
          keyFindings: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: ref("Assumption") },
          limitations: { type: "array", items: { type: "string" } },
          visualizationData: { type: ["object", "null"], description: "{ charts: [{ type: bar | histogram | box | group_means | box_by_group | grouped_bar | scatter, ... }] }" },
          error: { type: ["string", "null"] },
          errorDetails: {},
          createdAt: { type: "string" },
        },
      },
      Report: {
        type: "object",
        properties: { id: { type: "string" }, analysisId: { type: "string" }, title: { type: "string" }, status: { enum: ["PENDING", "COMPLETED", "FAILED"] }, error: { type: ["string", "null"] }, generatedBy: {}, createdAt: { type: "string" } },
      },
      SignedUrl: { type: "object", properties: { url: { type: "string" }, expiresInSeconds: { type: "integer" }, fileName: { type: "string" } } },
    },
  },
  paths: {
    "/api/v1/health": { get: { tags: ["System"], summary: "Health check", responses: { 200: ok({ type: "object" }) } } },

    "/api/v1/auth/csrf": {
      get: { tags: ["Auth"], summary: "Issue a CSRF token (cookie + body)", responses: { 200: ok({ type: "object", properties: { csrfToken: { type: "string" } } }) } },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a hospital: creates user, organisation and admin membership in one transaction",
        security: [{ csrfToken: [] }],
        requestBody: body({
          type: "object",
          required: ["fullName", "email", "password", "organizationName", "organizationEmail"],
          properties: {
            fullName: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 10 },
            organizationName: { type: "string" },
            organizationEmail: { type: "string", format: "email" },
            aiProcessingConsent: { type: "boolean", default: false, description: "Enable external AI processing (Z.ai). Can be changed later by an admin." },
          },
        }),
        responses: { 201: ok({ type: "object", properties: { user: ref("User"), organization: ref("Organization"), membership: {}, csrfToken: { type: "string" } } }), ...err([400, 403, 409, 429]) },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in. Sets auth cookies",
        security: [{ csrfToken: [] }],
        requestBody: body({ type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" }, organizationSlug: { type: "string", description: "Only for users in several organisations" } } }),
        responses: { 200: ok({ type: "object", properties: { csrfToken: { type: "string" } } }), ...err([400, 401, 403, 429]) },
      },
    },
    "/api/v1/auth/refresh": {
      post: { tags: ["Auth"], summary: "Rotate the refresh token and issue a new access token", security: [{ csrfToken: [] }], responses: { 200: ok({ type: "object" }), ...err([401, 403]) } },
    },
    "/api/v1/auth/logout": { post: { tags: ["Auth"], summary: "Revoke the session and clear cookies", security: authCsrf, responses: { 200: ok({ type: "object" }), ...err([401, 403]) } } },
    "/api/v1/auth/me": {
      get: { tags: ["Auth"], summary: "Current user, organisation and role", security: auth, responses: { 200: ok({ type: "object", properties: { user: ref("User"), organization: {}, membership: { type: "object", properties: { id: { type: "string" }, role: ref("Role") } } } }), ...err([401]) } },
    },
    "/api/v1/auth/accept-invite": {
      post: {
        tags: ["Auth"],
        summary: "Accept an invitation with the one-time token. Existing users must give their current password",
        security: [{ csrfToken: [] }],
        requestBody: body({ type: "object", required: ["token", "fullName", "password"], properties: { token: { type: "string" }, fullName: { type: "string" }, password: { type: "string" } } }),
        responses: { 200: ok({ type: "object" }), ...err([400, 401, 403]) },
      },
    },

    "/api/v1/organization": {
      get: { tags: ["Organization"], summary: "Current organisation with AI disclosure", description: roles("organization:read"), security: auth, responses: { 200: ok(ref("Organization")), ...err([401, 403]) } },
      patch: {
        tags: ["Organization"],
        summary: "Update organisation details or the external AI processing setting",
        description: roles("organization:update"),
        security: authCsrf,
        requestBody: body({ type: "object", properties: { name: { type: "string" }, email: { type: "string" }, aiProcessingEnabled: { type: "boolean" } } }),
        responses: { 200: ok(ref("Organization")), ...err([400, 401, 403]) },
      },
    },
    "/api/v1/organization/members": {
      get: { tags: ["Organization"], summary: "List members", description: roles("members:read"), security: auth, responses: { 200: ok({ type: "array", items: ref("Member") }), ...err([401, 403]) } },
    },
    "/api/v1/organization/members/invite": {
      post: {
        tags: ["Organization"],
        summary: "Invite a member. Returns a one-time inviteToken to share with them (no email is sent)",
        description: roles("members:manage"),
        security: authCsrf,
        requestBody: body({ type: "object", required: ["email", "fullName", "role"], properties: { email: { type: "string" }, fullName: { type: "string" }, role: ref("Role") } }),
        responses: { 201: ok({ type: "object", properties: { member: ref("Member"), inviteToken: { type: "string" }, inviteExpiresAt: { type: "string" } } }), ...err([400, 401, 403, 409]) },
      },
    },
    "/api/v1/organization/members/{id}": {
      patch: {
        tags: ["Organization"],
        summary: "Change a member's role or suspend them",
        description: `${roles("members:manage")} The last active admin cannot be demoted or suspended.`,
        security: authCsrf,
        parameters: [idParam],
        requestBody: body({ type: "object", properties: { role: ref("Role"), status: { enum: ["ACTIVE", "SUSPENDED"] } } }),
        responses: { 200: ok(ref("Member")), ...err([400, 401, 403, 404]) },
      },
      delete: { tags: ["Organization"], summary: "Remove a member", description: roles("members:manage"), security: authCsrf, parameters: [idParam], responses: { 200: ok({ type: "object" }), ...err([400, 401, 403, 404]) } },
    },
    "/api/v1/organization/audit-logs": {
      get: { tags: ["Organization"], summary: "Audit trail, newest first", description: roles("audit:read"), security: auth, parameters: page, responses: { 200: ok(paged({ type: "object" })), ...err([401, 403]) } },
    },

    "/api/v1/datasets/upload": {
      post: {
        tags: ["Datasets"],
        summary: "Upload a CSV or XLSX dataset (multipart field `file`)",
        description: `${roles("dataset:upload")} Content is validated by bytes. Macro workbooks, mismatched extensions and binaries are rejected. Default limit 10 MB.`,
        security: authCsrf,
        requestBody: body({ type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, name: { type: "string" }, description: { type: "string" } } }, "multipart/form-data"),
        responses: { 201: ok({ allOf: [ref("Dataset"), { type: "object", properties: { columns: { type: "array", items: ref("Column") } } }] }), ...err([400, 401, 403, 413, 422, 429]) },
      },
    },
    "/api/v1/datasets": {
      get: { tags: ["Datasets"], summary: "List datasets", description: roles("dataset:read"), security: auth, parameters: page, responses: { 200: ok(paged(ref("Dataset"))), ...err([401, 403]) } },
    },
    "/api/v1/datasets/{id}": {
      get: {
        tags: ["Datasets"],
        summary: "Dataset with columns and cleaning history",
        description: roles("dataset:read"),
        security: auth,
        parameters: [idParam],
        responses: { 200: ok({ allOf: [ref("Dataset"), { type: "object", properties: { columns: { type: "array", items: ref("Column") }, transformations: { type: "array" } } }] }), ...err([401, 403, 404]) },
      },
      delete: {
        tags: ["Datasets"],
        summary: "Delete a dataset. Files are removed; analyses and reports are kept",
        description: `${roles("dataset:delete")} Researchers can delete only their own uploads.`,
        security: authCsrf,
        parameters: [idParam],
        responses: { 200: ok({ type: "object", properties: { deleted: { type: "boolean" }, analysesRetained: { type: "integer" } } }), ...err([401, 403, 404]) },
      },
    },
    "/api/v1/datasets/{id}/preview": {
      get: {
        tags: ["Datasets"],
        summary: "First rows of the dataset",
        description: `${roles("dataset:read")} Identifier columns are masked for ANALYST and VIEWER.`,
        security: auth,
        parameters: [idParam, { name: "limit", in: "query", schema: { type: "integer", maximum: 100, default: 20 } }, { name: "version", in: "query", schema: { enum: ["current", "original", "processed"] } }],
        responses: { 200: ok({ type: "object", properties: { version: { type: "string" }, columns: { type: "array" }, rows: { type: "array" }, totalRows: { type: "integer" }, maskedColumns: { type: "array" } } }), ...err([401, 403, 404]) },
      },
    },
    "/api/v1/datasets/{id}/quality": {
      get: { tags: ["Datasets"], summary: "Data quality report with cleaning recommendations", description: roles("dataset:read"), security: auth, parameters: [idParam], responses: { 200: ok(ref("QualityReport")), ...err([401, 403, 404]) } },
    },
    "/api/v1/datasets/{id}/clean": {
      post: {
        tags: ["Datasets"],
        summary: "Apply cleaning operations. Creates a new processed version; the original is preserved",
        description: roles("dataset:clean"),
        security: authCsrf,
        parameters: [idParam],
        requestBody: body({ type: "object", required: ["operations"], properties: { operations: { type: "array", minItems: 1, maxItems: 20, items: ref("CleaningOperation") } } }),
        responses: { 201: ok({ type: "object", properties: { transformation: { type: "object" }, quality: ref("QualityReport"), columns: { type: "array", items: ref("Column") } } }), ...err([400, 401, 403, 404, 422]) },
      },
    },
    "/api/v1/datasets/{id}/reset": {
      post: { tags: ["Datasets"], summary: "Return to the original upload. History is kept", description: roles("dataset:clean"), security: authCsrf, parameters: [idParam], responses: { 200: ok({ type: "object" }), ...err([400, 401, 403, 404]) } },
    },
    "/api/v1/datasets/{id}/download": {
      get: {
        tags: ["Datasets"],
        summary: "Short-lived signed download URL",
        description: roles("dataset:download"),
        security: auth,
        parameters: [idParam, { name: "version", in: "query", schema: { enum: ["original", "processed"], default: "original" } }],
        responses: { 200: ok(ref("SignedUrl")), ...err([400, 401, 403, 404]) },
      },
    },

    "/api/v1/analysis": {
      post: {
        tags: ["Analysis"],
        summary: "Ask a question about a dataset and run the analysis",
        description: [
          roles("analysis:create"),
          "Runs synchronously and returns the final analysis (COMPLETED or FAILED).",
          "Planning: explicit `plan` if given; otherwise Z.ai when the organisation enabled AI processing and the server has a key; otherwise column names are matched from the question.",
          "All numbers come from the deterministic statistics engine.",
        ].join(" "),
        security: authCsrf,
        requestBody: body({
          type: "object",
          required: ["datasetId", "question"],
          properties: {
            datasetId: { type: "string", format: "uuid" },
            question: { type: "string", example: "Analyse the relationship between maternal age and delivery complications." },
            plan: ref("AnalysisPlan"),
          },
        }),
        responses: { 201: ok(ref("Analysis")), ...err([400, 401, 403, 404, 429]) },
      },
      get: {
        tags: ["Analysis"],
        summary: "List analyses",
        description: roles("analysis:read"),
        security: auth,
        parameters: [...page, { name: "datasetId", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] } }],
        responses: { 200: ok(paged({ type: "object" })), ...err([401, 403]) },
      },
    },
    "/api/v1/analysis/{id}": {
      get: { tags: ["Analysis"], summary: "Analysis with results", description: roles("analysis:read"), security: auth, parameters: [idParam], responses: { 200: ok(ref("Analysis")), ...err([401, 403, 404]) } },
    },
    "/api/v1/analysis/{id}/retry": {
      post: { tags: ["Analysis"], summary: "Retry a FAILED analysis", description: roles("analysis:create"), security: authCsrf, parameters: [idParam], responses: { 200: ok(ref("Analysis")), ...err([400, 401, 403, 404]) } },
    },

    "/api/v1/reports": {
      post: {
        tags: ["Reports"],
        summary: "Generate a PDF report for a completed analysis",
        description: roles("report:create"),
        security: authCsrf,
        requestBody: body({ type: "object", required: ["analysisId"], properties: { analysisId: { type: "string", format: "uuid" }, title: { type: "string" } } }),
        responses: { 201: ok(ref("Report")), ...err([400, 401, 403, 404, 422]) },
      },
      get: { tags: ["Reports"], summary: "List reports", description: roles("report:read"), security: auth, parameters: [...page, { name: "analysisId", in: "query", schema: { type: "string" } }], responses: { 200: ok(paged(ref("Report"))), ...err([401, 403]) } },
    },
    "/api/v1/reports/{id}": {
      get: { tags: ["Reports"], summary: "Report metadata", description: roles("report:read"), security: auth, parameters: [idParam], responses: { 200: ok(ref("Report")), ...err([401, 403, 404]) } },
    },
    "/api/v1/reports/{id}/download": {
      get: { tags: ["Reports"], summary: "Short-lived signed download URL for the PDF", description: roles("report:read"), security: auth, parameters: [idParam], responses: { 200: ok(ref("SignedUrl")), ...err([401, 403, 404, 422]) } },
    },
    "/api/v1/files/{token}": {
      get: {
        tags: ["Files"],
        summary: "Serve a signed file link (local storage driver only). Requires the session cookie of the same organisation",
        security: auth,
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "File bytes" }, ...err([401, 404]) },
      },
    },
  },
};

module.exports = spec;
