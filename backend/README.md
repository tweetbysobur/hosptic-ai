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

## Known limits

- Analyses run inside the request. Long AI calls hold the request open, up to `ZAI_TIMEOUT_MS`.
- Applying cleaning operations and saving processed dataset versions is not built. The quality report gives recommendations only.
- Inviting a member needs an existing account. There is no email invitation flow.
- Personal-data detection uses column names only. It does not inspect values.
- No Fisher exact test, Welch ANOVA, post-hoc tests or multiple regression.
- Spearman p-values use a t approximation. Normality checks are skewness heuristics, not formal tests.
- Signed download URLs need S3-compatible storage. Local storage returns 501 for that endpoint.
- Danfo.js loads TensorFlow, which keeps the process alive. Jest runs with `--forceExit` for this reason.
