# Shared API contracts

Contract version 0.2.0. For the frontend developer.

- `openapi.yaml` is the formal contract. Swagger UI: `GET /api/docs` on the backend (not served in production).
- `examples/*.json` hold real responses recorded from the running backend with synthetic data, including live Z.ai output. Each file is `{ status, body }`. Build against these.
- Change rule: any change to an endpoint, request body, response shape or error code updates `openapi.yaml`, the examples and the changelog below in the same pull request. A breaking change needs the frontend developer's sign-off before merge.

## Conventions

- Base path `/api/v1`. JSON in and out, except uploads (multipart) and the report PDF.
- Success: `{ "success": true, "data": ... }`. Failure: `{ "success": false, "error": { "code", "message", "details?" } }`.
- Lists return `data: { items: [...], meta: { page, pageSize, total, totalPages } }`. Query: `page` (default 1), `pageSize` (default 20, max 100).
- IDs are UUIDs. Dates are ISO 8601 strings in UTC.
- The frontend never sends an organisation id to choose data. The server resolves the organisation from the signed-in user's membership.
- Records that belong to another organisation return `404`, the same as records that do not exist.

## Authentication

Login and register set three cookies:

| Cookie | HTTP-only | Path | Lifetime | Purpose |
| --- | --- | --- | --- | --- |
| `access_token` | yes | `/api` | 15 min | Identifies the user and organisation |
| `refresh_token` | yes | `/api/v1/auth` | 7 days | Gets a new session. Single use |
| `csrf_token` | no | `/` | 7 days | Copy into the `X-CSRF-Token` header |

Browser rules:

1. Send every request with `credentials: "include"`.
2. On every `POST`, `PATCH` and `DELETE`, send `X-CSRF-Token: <value of csrf_token cookie>`. Missing or wrong: `403 CSRF_FAILED`. This also applies to `/auth/refresh` and `/auth/logout`.
3. On `401` from any endpoint, call `POST /auth/refresh` once, then retry the original request once. If refresh returns `401`, go to the login page. Refresh rotates all three cookies. Never run two refreshes at once. A used refresh token is rejected.
4. Do not store tokens in `localStorage`. The response also returns `accessToken` for non-browser clients, which can send `Authorization: Bearer <accessToken>` instead. Bearer requests skip CSRF.
5. If the frontend runs on a different site than the API, the backend needs `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`, HTTPS, and the frontend origin in `FRONTEND_URL`. Same-site setups (for example both on one domain) work with the default `lax`.

Sessions are bound to one organisation. A user in several organisations signs in to the first one, or to one they choose by sending `organizationId` in the login body (it must be one of theirs, or the API returns `403`). The login response lists `organizations` when there is more than one. Switching organisation means logging in again with another `organizationId`.

## Endpoints

Roles: **A** admin (`ORGANIZATION_ADMIN`), **R** researcher, **N** analyst, **V** viewer. Wrong role returns `403 FORBIDDEN`.

| Method and path | Roles | Request | Success |
| --- | --- | --- | --- |
| `POST /auth/register` | public | `{ fullName, email, password, organizationName, organizationEmail? }` | `201` `{ user, organization, role, accessToken }` |
| `POST /auth/login` | public | `{ email, password, organizationId? }` | `200` `{ user, organization, role, organizations?, accessToken }` |
| `POST /auth/refresh` | cookie | none | `200` `{ accessToken }` |
| `POST /auth/logout` | any | none | `200` `{ loggedOut: true }` |
| `GET /auth/me` | A R N V | none | `200` `{ user, organization, role }` |
| `GET /organization` | A R N V | none | `200` organisation |
| `PATCH /organization` | A | `{ name?, email? }` | `200` organisation |
| `GET /organization/members` | A | none | `200` array of members |
| `POST /organization/members/invite` | A | `{ email, role }` | `201` member |
| `PATCH /organization/members/:id` | A | `{ role?, status? }` | `200` member |
| `DELETE /organization/members/:id` | A | none | `200` `{ id, removed: true }` |
| `POST /datasets/upload` | A R | multipart: `file`, `name?`, `description?` | `201` dataset with `columns` and `quality` |
| `GET /datasets` | A R N V | `?page&pageSize` | `200` list |
| `GET /datasets/:id` | A R N V | none | `200` dataset with `columns` |
| `DELETE /datasets/:id` | A, R (own uploads) | none | `200` `{ id, deleted: true }` |
| `GET /datasets/:id/preview` | A R N | `?limit` (1 to 50, default 20) | `200` `{ headers, rows, maskedColumns, totalRows }` |
| `GET /datasets/:id/quality` | A R N V | none | `200` quality report |
| `GET /datasets/:id/download` | A R N | none | `200` `{ url, expiresInSeconds }`, or `501` on local storage |
| `POST /analysis` | A R N | `{ datasetId, question }` | `201` analysis |
| `GET /analysis` | A R N V | `?page&pageSize&datasetId` | `200` list |
| `GET /analysis/:id` | A R N V | none | `200` analysis |
| `POST /analysis/:id/retry` | A, R N (own) | none | `200` analysis |
| `POST /reports` | A R | `{ analysisId, title? }` | `201` report |
| `GET /reports` | A R N V | `?page&pageSize` | `200` list |
| `GET /reports/:id` | A R N V | none | `200` report |
| `GET /reports/:id/download` | A R N V | none | `200` PDF (`application/pdf`, attachment) |

`:id` for members is the membership id from the members list, not the user id.

Field rules: password 10 to 128 characters with a letter and a number. `question` 5 to 1000 characters. Report `title` 3 to 160 characters. Upload limits: 10 MB (server setting), 100,000 rows, 200 columns, `.csv` (UTF-8) or `.xlsx` only.

## Analysis responses

`POST /analysis` runs synchronously and can take 10 to 60 seconds with the real AI. Show a progress state and set a client timeout of at least 120 seconds. It always returns `201` with the final record. Read `status`:

- `COMPLETED`: `methodology`, `results`, `assumptions`, `limitations`, `visualizationData` are filled. `interpretation` is a string, or `null` when the AI text failed validation. When it is `null`, show the statistics and the limitations, which explain why.
- `FAILED`: `errorMessage` holds a safe, user-readable reason (AI not configured, column not usable, assumption violated, too few observations). Offer `POST /analysis/:id/retry`.
- `PENDING` and `PROCESSING` exist in the enum. In the current synchronous design a client only sees them when listing while another request is running.

`results` holds only the metrics that apply to the chosen method. Common keys: `sampleSize`, `testStatistic { name, value }`, `pValue`, `pValueDisplay`, `degreesOfFreedom`, `confidenceInterval { level, lower, upper }`, `effectSize { name, value }`. Method-specific keys: `groups`, `meanDifference`, `contingencyTable`, `coefficients`, `rSquared`, `summary`, `frequencies`. Display `pValueDisplay`, never the raw `pValue` (tiny values round to 0). Do not assume a key exists. Check before rendering.

`analysisType` values: `DESCRIPTIVE`, `INDEPENDENT_T_TEST`, `PAIRED_T_TEST`, `ONE_WAY_ANOVA`, `CHI_SQUARE`, `PEARSON_CORRELATION`, `SPEARMAN_CORRELATION`, `LINEAR_REGRESSION`.

`visualizationData.type` decides the chart:

| type | Fields | Suggested chart |
| --- | --- | --- |
| `histogram` | `variable`, `bins[{ start, end, count }]` | bar chart |
| `bar` | `variable`, `categories[{ label, count }]` | bar chart |
| `groupSummary` | `variable`, `groups[{ group, sampleSize, mean, median, q1, q3, min, max, standardDeviation }]` | box plot or mean bars |
| `heatmap` | `rows[]`, `columns[]`, `observed[][]` | table or heatmap |
| `scatter` | `x`, `y`, `points[{ x, y }]` (max 500), `fitLine?` `{ slope, intercept, xMin, xMax }` | scatter with line |

`methodology.aiDisclosure` states what was sent to Z.ai. Show it where users run analyses. Columns flagged `isSensitive` are never sent and cannot be used.

## Error codes

| HTTP | `error.code` | Meaning and frontend action |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body or query invalid. `details[{ path, message }]` map to form fields |
| 400 | `BAD_REQUEST` | Other malformed request (bad JSON, unsupported file extension, last admin rule) |
| 401 | `UNAUTHORIZED` | Not signed in, expired, or membership suspended or removed. Refresh once, then login. Wrong login returns `Invalid email or password` |
| 403 | `FORBIDDEN` | Role not allowed, or not a member of the requested organisation. Hide the action for that role |
| 403 | `CSRF_FAILED` | `X-CSRF-Token` missing or not equal to the cookie. Re-read the cookie |
| 404 | `NOT_FOUND` | Missing, deleted, or in another organisation |
| 409 | `CONFLICT` | Email already registered, member already in the organisation, analysis not in FAILED state, analysis already running |
| 413 | `FILE_TOO_LARGE` | Upload over the size limit |
| 422 | `UNPROCESSABLE` | File content bad (binary data, not UTF-8, macros, empty), dataset not ready, analysis not completed |
| 429 | `RATE_LIMITED` | Back off. Auth routes allow 20 requests per 15 minutes per IP by default |
| 501 | `NOT_SUPPORTED` | Signed download needs S3 storage |
| 500 | `INTERNAL_ERROR` | Unexpected. Safe generic message |
| 502, 503 | `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, `AI_NOT_CONFIGURED` | Appear inside a `FAILED` analysis `errorMessage`, not as an HTTP status on `POST /analysis` |

## Behaviours to design for

- A dataset delete hides the dataset and removes its file. Its analyses and reports stay readable. Do not link from an analysis to a deleted dataset's preview.
- Viewers can list datasets, analyses and reports, but cannot preview rows or run analyses.
- Preview rows replace sensitive columns with `"[masked]"`.
- Report generation is synchronous. `status` is `READY` or `FAILED`. Download from `downloadPath` with credentials. There are no public file URLs.
- A membership change takes effect on the user's next request. Expect a sudden `401` for a suspended user.

## Changelog

- 0.2.1: Fixed scatter `points` for correlation and regression. `x` is now the predictor and `y` the outcome, matching the `x` and `y` labels and `fitLine`. They were swapped before.
- 0.2.0: Added `results.pValueDisplay`. Rewrote this README from confirmed behaviour. Added `examples/`.
- 0.1.0: Initial contract.
