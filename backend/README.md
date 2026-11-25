# Hosptic AI backend

Express API for hospital data analysis. Node.js, vanilla JavaScript (CommonJS), Prisma, PostgreSQL with row-level security, Z.ai for method selection and plain-language interpretation.

API contract: `../shared/contracts/openapi.yaml`. Swagger UI runs at `/api/docs` outside production.

## Setup

Requirements: Node.js 20 or later, PostgreSQL 14 or later.

```bash
cd backend
npm install
cp .env.example .env
```

Create the database, run migrations as the owner, then create the restricted runtime role:

```bash
createdb hosptic
DIRECT_URL=postgresql://<owner>@localhost:5432/hosptic DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
psql postgresql://<owner>@localhost:5432/hosptic -v app_password="'<strong-password>'" -f sql/create-app-role.sql
```

Set in `.env`:

- `DATABASE_URL` connects as `hosptic_app`. This role owns no tables and has no BYPASSRLS, so RLS applies to every query.
- `DIRECT_URL` connects as the owner. Prisma uses it for migrations only.
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: 32 characters or more each (`openssl rand -hex 32`).
- `ZAI_API_KEY` and `ZAI_MODEL` enable AI. Without them, analyses fail with "AI analysis is not configured".

```bash
npm start
```

Run migrations again with `DIRECT_URL` after a schema change. Re-run `sql/create-app-role.sql` if new tables are added.

## Tests

The tests need a separate database with the same migrations and role:

```bash
createdb hosptic_test
DIRECT_URL=postgresql://<owner>@localhost:5432/hosptic_test DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
psql postgresql://<owner>@localhost:5432/hosptic_test -v app_password="'app_dev_pw'" -f sql/create-app-role.sql
npm test
```

`tests/test.env` holds test-only settings with dummy secrets. The suites:

- `tests/unit/stats.test.js`: statistics checked against hand-calculated values.
- `tests/unit/planner.test.js`: AI output validation, file type checks, column inference.
- `tests/unit/quality.test.js`: CSV and XLSX parsing, quality issues.
- `tests/integration/rls.test.js`: RLS checked directly in PostgreSQL, with no application filtering.
- `tests/integration/api.test.js`: auth, CSRF, roles, cross-organisation access, analysis, reports.
- `tests/integration/s3.test.js` and `limits.test.js`: S3 storage with signed URLs, upload size limit.

AI tests replace the Z.ai network call with a fixed response through `setZaiClientForTesting`. No test calls the live Z.ai API.

## Layout

```
src/
  server.js          process start and graceful shutdown
  app.js             Express setup: helmet, CORS, rate limits, CSRF, routes, errors
  config/env.js      validated environment variables
  db/                Prisma client and tenant transaction helpers
  middleware/        auth, RBAC, CSRF, validation, uploads, errors
  routes/            URL to controller mapping
  controllers/       HTTP in and out only
  services/          business logic and database work
  validators/        zod request schemas
  analytics/         column profiling, quality checks, statistics engine, plan validation
  ai/                Z.ai client, prompts, output schemas, interpretation checks
  storage/           private local or S3-compatible storage
  utils/             errors, tokens, cookies, permissions, logging
prisma/              schema and migrations (including RLS policies)
sql/                 restricted role setup
```

## Tenant isolation

Each organisation-owned table has a FORCE ROW LEVEL SECURITY policy for SELECT, INSERT, UPDATE and DELETE that compares `organizationId` with `app_current_org()`.

`withTenant(organizationId, fn)` opens a transaction and runs `set_config('app.organization_id', $1, true)` with a bound parameter. The setting ends with the transaction, so a pooled connection never keeps one organisation's context. A query with no context returns no rows.

The organisation comes from the access token, which the server signs at login from a verified membership. Every request re-reads the membership, so a suspended or removed member loses access at once. The API never takes an organisation id from the client to choose data. The login `organizationId` field only picks among the caller's own memberships.

Analyses, reports and audit logs cannot be deleted by the runtime role. Audit logs cannot be updated.

## Roles

| Action | Admin | Researcher | Analyst | Viewer |
| --- | --- | --- | --- | --- |
| View organisation | yes | yes | yes | yes |
| Update organisation, manage members | yes | no | no | no |
| List datasets, view quality report | yes | yes | yes | yes |
| Upload datasets | yes | yes | no | no |
| Preview rows, signed download | yes | yes | yes | no |
| Delete datasets | yes | own uploads | no | no |
| Run analyses | yes | yes | yes | no |
| Retry failed analyses | any | own | own | no |
| View analyses and reports | yes | yes | yes | yes |
| Generate reports | yes | yes | no | no |

## Analysis workflow

1. Check the role and load the dataset inside the caller's tenant context.
2. Send Z.ai the question and column metadata: names, types, missing percentages, up to 15 category labels. No row values. No columns flagged as personal data.
3. Validate the reply with a strict schema. Check that each column exists, is not sensitive, and has the right type for its role.
4. Run the statistics in JavaScript (jStat, Simple Statistics). Hard assumption failures stop the analysis with an explanation. Soft ones are listed under `assumptions`.
5. Send Z.ai the computed results only and ask for an explanation.
6. Reject the explanation if it contains numbers not in the results, contradicts the p-value, or claims causation. The statistics are still saved, and a limitation records why there is no interpretation.

Supported methods: descriptive statistics, Welch t-test, paired t-test, one-way ANOVA, chi-square, Pearson, Spearman, simple linear regression.

## Live Z.ai test

`tests/live/zai.live.test.js` calls the real Z.ai API on a synthetic maternity dataset (`tests/fixtures/synthetic.js`, seeded, no real patients). It is skipped unless `ZAI_LIVE=1`.

```bash
ZAI_API_KEY=<key> ZAI_MODEL=glm-4.6 npm run test:live
```

Last run: 7 of 7 passed with `glm-4.6`. It covered t-test, ANOVA, chi-square, correlation, descriptive and paired t-test questions, and a request to list patient names. The identifier column was never used and no names were returned. Reasoning models can take 10 to 60 seconds per call. Set `ZAI_TIMEOUT_MS` to 120000 or more if calls time out.

The built-in `fetch` in Node ignores `HTTPS_PROXY`. Behind a proxy, start the process with `NODE_USE_ENV_PROXY=1` (Node 22.21 or later) and `NODE_EXTRA_CA_CERTS=<proxy CA file>`.

## Object storage

`STORAGE_DRIVER=s3` uses the AWS SDK v3 with path-style addressing, so it targets S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces and MinIO. Set `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` and `STORAGE_REGION`.

Bucket requirements:

- Block all public access. The API never exposes object URLs. Only signed URLs from `GET /datasets/:id/download` (valid 300 seconds) reach the browser.
- Give the access key read, write and delete on this one bucket only.
- Objects are written with `ServerSideEncryption: AES256`. If your provider rejects that header, remove it in `src/storage/index.js`.

`tests/integration/s3.test.js` runs the real S3 client code against `s3rver`, an S3-compatible emulator that verifies request signatures. It checks put, get and delete, key validation, signed URL download, tampered and expired URLs, the download endpoint, cross-organisation denial and file removal on dataset delete. It does not prove behaviour on a specific provider. Run a smoke test against your real bucket before launch.

## Known limits

Not built yet:

- Dataset cleaning and processed versions. The quality report gives recommendations only.
- Email invitations. A member can be added only if they already have an account.
- Password reset, email verification and multi-factor sign-in.
- Switching organisation without logging in again.

Behaviour to know:

- Analyses and reports run inside the HTTP request. An analysis can hold a request open for about 2 minutes with a slow AI model. There is no job queue, so a server restart during a run leaves the record in PROCESSING. Retry works only for FAILED records, so such a record needs manual cleanup.
- Datasets are parsed in memory on every preview and analysis. Limits: 10 MB, 100,000 rows, 200 columns.
- Personal-data detection uses column names only. A column that holds names under a neutral header is not masked, and its category labels (up to 15 per column) can reach Z.ai. Review datasets before upload.
- The free-text question goes to Z.ai as typed. Users must not put patient details in it.
- Statistics: no Fisher exact test, Welch ANOVA, post-hoc tests, logistic or multiple regression, or non-parametric group tests. Normality and variance checks are skewness and variance-ratio heuristics, not formal tests. Spearman p-values use a t approximation. A binary outcome against a numeric predictor is not supported and fails with an explanation.
- `pValue` is rounded to 6 decimals, so tiny values appear as 0. Use `pValueDisplay`.
- Rate limiting is in memory and per process. Use a shared store if you run several instances.
- Signed download URLs need S3-compatible storage. Local storage returns 501.
- Danfo.js loads TensorFlow, which keeps the process alive and slows startup. Jest runs with `--forceExit` for this reason.
- Swagger UI is off when `NODE_ENV=production`. The YAML stays in `shared/contracts`.
