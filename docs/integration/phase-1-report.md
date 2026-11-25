# Phase 1 integration report: backend API

Backend reviewed: `origin/claude/dazzling-ramanujan-xwb396` at `f62687b`. Contract: `shared/contracts/openapi.yaml` (base `/api/v1`).

## 1. Existing frontend architecture

- Next.js 16 App Router, JavaScript and JSX only, Tailwind v4, Manrope.
- Public pages: landing `/`, demo `/demo`, sign-in `/login`, registration `/register`.
- Protected workspace: `/app`, which renders `AppShell` with the live data adapter.
- Auth: frontend route handlers under `/api/auth/*` and a placeholder contract in `lib/auth/contract.js`. Those paths are not in the backend contract.
- Demo: separate adapter that runs the analysis engine in the browser. It makes no network calls and uses `hosptic.demo.*` storage keys.

## 2. Existing mock functionality

| Location | What it does | Replace in |
| --- | --- | --- |
| `lib/auth/contract.js` | Placeholder auth paths (`/auth/register` and others) | Phase 1 |
| `app/api/auth/*` (6 routes) | Frontend routes built on invented paths | Phase 1 |
| `components/auth/OrganisationForm.js`, `app/onboarding` | Create or join organisation; no backend join endpoint | Phase 1 (removed) |
| `lib/auth/validation.js` | Password minimum 8; backend requires 10. Organisation type and country do not exist in the backend | Phase 1 |
| `app/app/layout.js` | Server-side session check reading `access_token`. The cookie is scoped to `/api`, so the server cannot see it | Phase 1 |
| `components/AppShell.js` (live adapter) | Identity is hardcoded as "Hospital workspace" | Phase 1 |
| `app/api/datasets/route.js`, `app/api/analyze/route.js` | Serve bundled synthetic data and the local engine | Phase 2 |
| `lib/datasets.js`, `lib/engine.js`, `lib/stats.js` | Synthetic datasets and local statistics | Phase 2 (demo keeps these) |
| `lib/store.js` (conversations, reports in localStorage) | Client-only chat state. The backend has no conversation resource | Phase 2 decision |
| `reportToMarkdown` / download | Client-side Markdown report. Backend produces PDF | Phase 3 |
| `components/Chart.js` | Chart types `bar, histogram, line, hbar, scatter, box` | Phase 2. Backend sends `histogram, bar, groupSummary, heatmap, scatter` |
| `Workspace` starters, `DEFAULT_DATASETS` | Hardcoded `maternal` and `admissions` dataset IDs | Phase 2 |

## 3. Confirmed backend endpoints (from the contract)

| Feature | Method and path | Phase |
| --- | --- | --- |
| Register (creates user, organisation and admin) | POST `/api/v1/auth/register` | 1 |
| Sign in | POST `/api/v1/auth/login` | 1 |
| Sign out | POST `/api/v1/auth/logout` (CSRF) | 1 |
| Rotate session | POST `/api/v1/auth/refresh` (CSRF) | 1 |
| Current session | GET `/api/v1/auth/me` | 1 |
| Organisation | GET and PATCH `/api/v1/organization` | 1 (read) |
| Members | GET `/api/v1/organization/members`, POST `.../invite`, PATCH and DELETE `.../{id}` | later |
| Datasets | POST `/api/v1/datasets/upload` (multipart), GET `/api/v1/datasets`, GET, DELETE `/api/v1/datasets/{id}`, `/preview`, `/quality`, `/download` | 2 |
| Analyses | POST `/api/v1/analysis`, GET `/api/v1/analysis`, GET `/{id}`, POST `/{id}/retry` | 2 |
| Reports | POST `/api/v1/reports`, GET `/api/v1/reports`, GET `/{id}`, GET `/{id}/download` (PDF) | 3 |
| Health | GET `/api/v1/health` | 1 |

Probed against the running backend (not assumed):
- Cookies: `access_token` (HttpOnly, `Path=/api`, 900 s); `refresh_token` (HttpOnly, `Path=/api/v1/auth`); `csrf_token` (readable, `Path=/`).
- Errors use `{ success:false, error:{ code, message, details? } }`. Codes seen: `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400, with `details[{path,message}]`), `CONFLICT` (409), `CSRF_FAILED` (403), `NOT_FOUND` (404).
- Register and login return `accessToken` in the body as well as the cookie. The frontend will not store it.
- POST without `X-CSRF-Token` returns 403 `CSRF_FAILED`.

## 4. Missing or unclear contracts (clarification needed)

1. Deployment topology. The plan is a same-origin proxy: `/api/v1/*` on the frontend forwards to the backend. This keeps the cookies first-party. Confirm this is acceptable, and confirm the backend URL variable name (`HOSPTIC_API_URL` proposed).
2. Logout does not revoke the access token. It revokes only the refresh token, so a captured access token stays valid until it expires (15 minutes). Confirm whether this is accepted.
3. Organisation join by invitation code. The backend has no endpoint. Only admin invite of an existing account exists. The frontend join flow is removed.
4. Registration now requires `organizationName`. The organisation type and country fields in the frontend have no backend equivalent and are removed.
5. Complete error code list. Only the codes above were observed. Status-based fallbacks are used for everything else. Please confirm the code for suspended members, rate limiting (429) and expired refresh.
6. Multiple organisations. Login can return `organizations` when a user belongs to several. There is no picker in the frontend yet.
7. Conversations. There is no conversation or thread resource. Analyses have a `question` and a `datasetId`. Please confirm whether chat threads should stay client-side or get a backend model.
8. Analysis methods. The planner accepts method types, not the frontend's intent names (`compare`, `trend`, ...). Phase 2 needs confirmation of how natural questions map to `analysisType`.
9. Analysis response when AI is disabled. The backend records a `FAILED` analysis with `errorMessage`. Confirm the HTTP status (201 is documented).

## 5. Files to modify (Phase 1)

- New: `lib/api/` (config, errors, client, proxy, endpoints), `app/api/v1/[...path]/route.js`, `components/auth/SessionProvider.js`, `docs/integration/`, integration tests.
- Changed: `lib/auth/validation.js`, `lib/auth/messages.js`, `lib/auth/session.js`, `components/auth/LoginForm.js`, `RegisterForm.js`, `SignOutButton.js`, `app/app/layout.js`, `app/login/page.js`, `app/register/page.js`, `components/AppShell.js`, `components/Sidebar.js`, `lib/auth/contract.js`.
- Removed: `app/api/auth/*`, `app/onboarding/`, `components/auth/OrganisationForm.js`, `lib/auth/backend.js`, `lib/auth/request.js`.

## 6. Integration risks

- Cookie scope. `access_token` is only sent to `/api/*`, so server components cannot see it. Protected checks must run in the browser against `/api/v1/auth/me`. The static shell of `/app` is public, but all data comes from authenticated API calls.
- CSRF cookie is readable by JavaScript (contract). Mitigation: no `dangerouslySetInnerHTML`, strict output encoding.
- Proxy and large or long requests. Multipart uploads and AI analysis hold the request open. Streaming and timeouts must be tested in Phase 2.
- Demo isolation. Demo code must never import the API client. Tests will enforce this.
- Existing mock routes under `/api/datasets` and `/api/analyze` remain live until Phase 2. The live workspace therefore still shows synthetic data until then.
