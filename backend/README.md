# Hosptic AI backend

Express API for Hosptic AI. Hospitals upload CSV or Excel datasets, check data quality, ask questions in plain language and get statistical results, interpretations and PDF reports. Each hospital's data is isolated at the application layer and by PostgreSQL row-level security.

Stack: Node.js 20+, JavaScript (CommonJS), Express 4, Prisma 7 with the pg driver adapter, PostgreSQL 16, Zod, Argon2id, Papa Parse, ExcelJS, jStat, Simple Statistics, PDFKit, AWS S3 SDK, Jest and Supertest.

## Quick start

```bash
cd backend
npm install
cp .env.example .env            # fill in values

# 1. Create the two database roles (once, as a database admin)
psql "$ADMIN_URL" -v owner_password="'...'" -v app_password="'...'" -v db_name=hosptic -f scripts/setup-db-roles.sql

# 2. Apply migrations as the owner role (uses DIRECT_URL)
npx prisma migrate deploy
npx prisma generate

# 3. Run
npm run dev                     # http://localhost:4000, docs at /api/docs
```

Tests need a `hosptic_test` database with the same two roles. The test run drops and rebuilds its schema from the migration files.

```bash
npm test
```

## Layout

```
src/
  server.js            process entry, graceful shutdown
  app.js               Express app (helmet, CORS, rate limits, CSRF, routes, errors)
  config/              env validation, Prisma client, role permissions
  routes/              URL to middleware to controller wiring
  controllers/         HTTP in and out only
  services/            business logic, tenant transactions, audit, reports
  validators/          Zod request schemas
  middleware/          auth, RBAC, CSRF, validation, uploads, errors
  analytics/           parsing, profiling, quality, cleaning, statistics, planning
  ai/                  Z.ai client, prompt builder, intent and interpretation
  storage/             S3 and local drivers, storage key layout
  docs/openapi.js      OpenAPI 3.1 spec, served at /api/docs
prisma/                schema and SQL migrations (init, then RLS)
scripts/               role setup, OpenAPI export
tests/unit             statistics (checked against SciPy), parsing, cleaning, AI checks
tests/integration      auth, RBAC, datasets, analysis, reports, tenant isolation, RLS
```

## Tenant isolation

Three layers, each tested on its own.

1. The organisation is always taken from the signed-in user's membership row, read from the database on every request. Request bodies with an `organizationId` are rejected by strict validation.
2. Services filter every query by that organisation and return 404 for anything else.
3. PostgreSQL RLS. The API connects as `hosptic_app`, a role with no superuser, no BYPASSRLS and no table ownership. Every tenant query runs inside `withTenant()`, which opens a transaction and calls `set_config('app.current_org_id', $1, true)` with a bound parameter. The setting is transaction-local, so it disappears on commit and never carries to the next request on a pooled connection. With no context set, every policy matches zero rows.

Child rows use composite foreign keys (`datasetId, organizationId`) so a row cannot point at a parent in another hospital. Foreign key checks bypass RLS, so this matters.

The audit log is append-only for the application role (no UPDATE or DELETE grant). Organisations cannot be deleted by the application role.

`tests/integration/rls.test.js` connects with raw SQL as `hosptic_app` and checks every table without going through the application. `tests/integration/tenant-isolation.test.js` creates two hospitals and tries every endpoint across them.

## Authentication

- Access token: 15-minute JWT in an HttpOnly cookie.
- Refresh token: 7-day JWT in an HttpOnly cookie scoped to `/api/v1/auth`. Rotated on every refresh; only a hash is stored. Reusing an old refresh token revokes the session.
- Logout revokes the session in the database, so a copied access token stops working at once.
- CSRF: signed double-submit token. `GET /api/v1/auth/csrf` returns it; send it as `X-CSRF-Token` on every POST, PATCH and DELETE.
- Passwords: Argon2id. Unknown emails take the same time as wrong passwords.
- Invitations: an admin gets a one-time token to share (no email service in the MVP). New users set a password; existing users must enter their current password to join.

## Roles

| Permission | Admin | Researcher | Analyst | Viewer |
|---|---|---|---|---|
| View organisation, datasets, analyses, reports | yes | yes | yes | yes |
| Upload, clean, delete datasets | yes | yes (delete own) | no | no |
| Download dataset files | yes | yes | yes | no |
| Run analyses | yes | yes | yes | no |
| Generate reports | yes | yes | no | no |
| Manage organisation, members, AI setting, audit log | yes | no | no | no |

Identifier columns are masked in previews for Analyst and Viewer. Permissions live in `src/config/permissions.js`.

## Datasets

Upload accepts `.csv` and `.xlsx` up to 10 MB, 200,000 rows and 300 columns (configurable). Files are checked by their bytes: PDFs, executables and images renamed to `.csv` are refused, as are macro workbooks, non-workbook zips and workbooks that expand past 150 MB. Formula cells keep only their computed value.

Files go to private storage at `organizations/{organizationId}/datasets/{datasetId}/original.{csv|xlsx}`. Downloads use signed URLs that expire after 5 minutes. With the local driver, the signed link also requires the session cookie of the same organisation.

After upload each column gets a type (numeric, categorical, boolean, date, text, identifier, empty), missing and unique counts, a numeric summary or category counts, and an identifier flag. Identifier columns (names, phone numbers, emails, addresses, ID numbers, dates of birth, near-unique text) are excluded from AI payloads and from analysis.

The quality report lists duplicate rows, missing values, non-numeric values in numeric columns, label variants such as "No" and "no", mixed or ambiguous date formats, IQR outliers, negative ages or counts and unexpected types. Each issue comes with a cleaning operation the user can apply.

Cleaning never edits the original. `POST /datasets/:id/clean` writes a new processed CSV, records the operations and their effects, and makes it the current version. `POST /datasets/:id/reset` returns to the original. Operations: `drop_duplicates`, `drop_missing`, `fill_missing`, `trim_whitespace`, `standardize_labels`, `coerce_numeric`, `remove_outliers`, `drop_columns`, `parse_dates`.

Deleting a dataset removes its files and hides it, but keeps analyses and reports built from it.

## Analysis workflow

`POST /api/v1/analysis` with `{ datasetId, question, plan? }` runs synchronously and returns the finished analysis.

1. Auth, organisation, dataset ownership and permission checks.
2. Plan the analysis:
   - an explicit `plan` from the client is used as is, or
   - Z.ai reads the question and the column metadata and proposes a method and variables, when the organisation has turned on AI processing and the server has a key, or
   - column names are matched in the question text (no AI).
3. Validate the plan against real column types. Unknown or identifier columns are refused. A t-test on a 3-group column becomes ANOVA, and the change is recorded. If Z.ai picks a method that does not fit the types, the method the types call for is used and the note says why.
4. Run the statistics engine.
5. Interpret: Z.ai explains the computed numbers, or a deterministic template does. AI text is rejected, and the template used, if it contains a number the engine did not produce, claims significance the test did not show (or denies it), or makes a causal claim.
6. Save and return methodology, results, interpretation, assumptions, limitations and chart data.

If Z.ai is down, planning falls back to column matching and interpretation falls back to the template. The response says which happened (`planSource`, `interpretationSource`, `methodology.planNotes`).

### Statistics

| Type | Method | Reports |
|---|---|---|
| `descriptive` | per column | n, mean, median, mode, SD, variance, min, max, quartiles, IQR, 95% CI of mean; or counts and Wilson 95% CIs |
| `frequency` | counts | counts, proportions, Wilson 95% CIs |
| `distribution` | histogram | Freedman-Diaconis bins, quartiles, skewness, kurtosis |
| `independent_t_test` | Welch's t-test | t, df, p, mean difference and 95% CI, Cohen's d, Hedges' g, Levene (Brown-Forsythe), Mann-Whitney U as a robustness check |
| `paired_t_test` | paired t-test | t, df, p, mean difference and 95% CI, Cohen's dz |
| `one_way_anova` | one-way ANOVA | F, df, p, eta squared, omega squared, Levene, Welch's ANOVA |
| `chi_square` | Pearson chi-square | chi-square, df, p, Cramer's V, expected counts; for 2x2 also Fisher's exact p and odds ratio with 95% CI |
| `pearson_correlation` | Pearson | r, R squared, t, df, p, Fisher-z 95% CI |
| `spearman_correlation` | Spearman | rho, t, df, p, 95% CI |
| `linear_regression` | OLS, one predictor | coefficients with SE, t, p, 95% CI; R squared, adjusted R squared, residual SE, F |

Every test is checked against SciPy reference values in `tests/unit/statistics.test.js`. Results go through a range check (p in 0 to 1, |r| at most 1, and so on) before they are saved.

Assumptions are checked where the data allow (normality screen, equal variances, expected cell counts, sample size, extreme residuals) and marked `met`, `violated`, `caution` or `not_checked`. Independence and linearity cannot be checked from data and are marked `not_checked` with a reason.

Known limits of this version:

- Normality is screened with skewness and kurtosis, not Shapiro-Wilk.
- ANOVA has no post-hoc pairwise tests.
- Regression has one predictor; no adjustment for confounders.
- Missing data are handled by listwise deletion, and the excluded count is reported.
- Spearman p-values use the t approximation, less accurate below n = 10.
- Date columns are profiled and cleaned but not analysed.

## Z.ai

`src/ai/zai.client.js` calls `POST {ZAI_API_BASE_URL}/chat/completions` with `Authorization: Bearer`, `response_format: { type: "json_object" }` and thinking disabled, as described in the Z.ai chat completion reference. Responses are parsed as JSON and validated with Zod.

What is sent: the question (emails, phone numbers and long ID numbers redacted), names and types of non-identifier columns, category labels for low-cardinality columns, numeric ranges, and computed results. What is never sent: rows, identifier columns, credentials. AI output is only ever data (a plan or text). The server never runs code or SQL from it.

AI processing is off for a new organisation unless the admin opts in at registration. `GET /api/v1/organization` returns `aiDisclosure` text for the frontend to show before an admin turns it on with `PATCH /api/v1/organization { aiProcessingEnabled: true }`. The change is audit-logged. Each analysis records whether external AI was used.

## Reports

`POST /api/v1/reports { analysisId, title? }` renders a PDF with PDFKit: organisation, title, question, dataset details, methodology, findings tables, charts, interpretation with its source, assumptions, limitations and generation date. Stored privately at `organizations/{organizationId}/reports/{reportId}.pdf`; `GET /reports/:id/download` returns a signed URL.

## API documentation

Swagger UI at `/api/docs` and the raw spec at `/api/v1/openapi.json` (development, or `ENABLE_API_DOCS=true`). `npm run docs:export` writes `shared/contracts/openapi.json` for the frontend.

## Notes for deployment

- Migrations are plain SQL in `prisma/migrations`. They were written by hand and applied with psql here, because Prisma's schema engine binary could not be downloaded in the build environment. Before the first deploy, run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url <url>` and confirm it reports no difference.
- Danfo.js was in the brief but is not used. Both `danfojs` and `danfojs-node` install `xlsx` from cdn.sheetjs.com rather than npm, plus TensorFlow. Column profiling is done with Papa Parse, ExcelJS and Simple Statistics instead.
- PDFKit is pinned to 0.17 because later versions load an ESM-only font library that Jest cannot import.
- Prisma's query interpreter loads relations in parallel inside a transaction, which makes `pg` print a deprecation warning. Queries still run in order on the same connection, so the tenant setting holds.
- Analyses run inside the request. A large file plus two Z.ai calls can take tens of seconds; a job queue is the next step if that becomes a problem.
- Rate limits use in-memory counters. Use a shared store (Redis) when running more than one instance.
