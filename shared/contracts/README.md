# API contract

Shared between `/backend` and the frontend. The full spec is `openapi.json` (regenerate with `cd backend && npm run docs:export`). This page covers what the frontend needs to get right.

Base path: `/api/v1`. Swagger UI runs at `/api/docs` on a development backend.

## Requests

- Send every request with credentials: `fetch(url, { credentials: "include" })`. Auth lives in HttpOnly cookies; the frontend never sees or stores tokens.
- Call `GET /auth/csrf` once on load. Keep `data.csrfToken` in memory and send it as `X-CSRF-Token` on every POST, PATCH and DELETE. Register, login and accept-invite return a fresh one; replace the stored value.
- Never send `organizationId`. The backend takes it from the signed-in membership and rejects unknown fields.
- On `401`, call `POST /auth/refresh` once and retry. If that also returns `401`, send the user to sign in.

## Responses

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Dataset not found", "details": [] } }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input. `details` lists `{ path, message }`. |
| 401 | Not signed in, or session expired. |
| 403 | Role lacks permission, or `CSRF_INVALID`. |
| 404 | Not found, including anything from another hospital. |
| 409 | Duplicate (email already registered, member already invited). |
| 413 | Upload over the size limit. |
| 422 | Valid request the data cannot satisfy (bad file, incompatible columns). |
| 429 | Rate limited. |

Lists return `{ items, nextCursor }`. Pass `?cursor=<nextCursor>&limit=20` for the next page; `nextCursor` is `null` at the end.

## Main flows

**Register**: `POST /auth/register { fullName, email, password (10+ chars), organizationName, organizationEmail, aiProcessingConsent? }`. Signs the user in as `ORGANIZATION_ADMIN`.

**Session**: `GET /auth/me` returns `{ user, organization, membership: { role } }`. Use `role` to show or hide actions; the backend enforces the same rules.

**Upload**: `POST /datasets/upload`, multipart with field `file` and optional `name`, `description`. Returns the dataset with `columns`. Each column has `type`, `missingCount`, `uniqueCount` and `isSensitive`. Grey out sensitive columns: they cannot be analysed.

**Quality**: `GET /datasets/:id/quality` returns `issues` and `recommendations`. Each recommendation carries an `operation` object that can be sent unchanged to `POST /datasets/:id/clean { operations: [...] }`.

**Ask a question**: `POST /analysis { datasetId, question }`. The call waits until the analysis finishes. Check `data.status`:

- `COMPLETED`: render `interpretation`, `results`, `assumptions`, `limitations`, `visualizationData.charts`.
- `FAILED`: show `error`. If `errorDetails.needsClarification` is true, `error` is a question for the user. If `errorDetails.availableColumns` is present, offer those names.

To skip question parsing (for example from a guided form), also send `plan`:

```json
{ "analysisType": "independent_t_test", "variables": { "outcome": "age", "group": "complication" } }
```

`results` contains only the fields that apply to the method. Common ones: `sampleSize`, `testStatistic { name, value }`, `degreesOfFreedom`, `pValue`, `confidenceInterval95`, `effectSize`, `significantAtAlpha`. Show `interpretationSource`: `zai` means written by Z.ai and checked against the numbers; `deterministic` or `deterministic_fallback` means written by Hosptic without AI.

**Charts** (`visualizationData.charts[]`):

| type | fields |
|---|---|
| `bar` | `column`, `data: [{ label, value }]` |
| `histogram` | `column`, `bins: [{ start, end, count }]` |
| `box` | `column`, `min, q1, median, q3, max` |
| `group_means` | `outcome`, `group`, `data: [{ label, mean, ci95: [lo, hi], n }]` |
| `box_by_group` | `outcome`, `data: [{ label, min, q1, median, q3, max }]` |
| `grouped_bar` | `x`, `series`, `categories`, `data: [{ label, values }]`, values are proportions |
| `scatter` | `x`, `y`, `points: [{ x, y }]`, `sampled`, optional `line: [{x,y},{x,y}]` |

**Reports**: `POST /reports { analysisId }`, then `GET /reports/:id/download` returns `{ url, expiresInSeconds, fileName }`. Open `url` right away; it expires in 5 minutes. Same pattern for `GET /datasets/:id/download?version=original|processed`.

**AI setting**: `GET /organization` returns `aiProcessingEnabled` and `aiDisclosure`. Show the disclosure before an admin turns AI on with `PATCH /organization { aiProcessingEnabled: true }`.

## Roles

| Action | Admin | Researcher | Analyst | Viewer |
|---|---|---|---|---|
| View data, analyses, reports | yes | yes | yes | yes |
| Upload, clean datasets | yes | yes | no | no |
| Delete datasets | yes | own uploads | no | no |
| Run analyses | yes | yes | yes | no |
| Generate reports | yes | yes | no | no |
| Members, settings, audit log | yes | no | no | no |
