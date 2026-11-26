# Hosptic AI: Product Requirements

Status: living document. It describes the product as built today, then what comes next. Update it when scope changes.

## 1. Summary

Hosptic AI lets hospital teams ask questions about their own data in plain language and get answers they can check. Each answer leads with the finding, explains it in plain words, shows the evidence (charts and tables), states the method and its limits, and suggests the next question.

The product has two parts:

- **Landing site** (`/`): explains the product and routes visitors to sign up or sign in.
- **Hosptic Provider** (`/app`): the signed-in workspace for an organisation's own data.

## 2. Problem

Hospital datasets (admissions, maternity registers, outcomes) hold answers to everyday questions: which ward has longer stays, whether a change in practice is linked to fewer complications, how complete a register is. Getting those answers usually needs a statistician or analyst, and that takes time. Results often come back without a plain explanation of what they mean and what they cannot show.

## 3. Users and roles

| Role | Who | Can do |
| --- | --- | --- |
| Organisation admin | Head of a research or quality unit | Everything, including managing members |
| Researcher | Clinical researcher | Upload and delete own datasets, run analyses, generate reports |
| Analyst | Data or quality analyst | Preview data, run analyses |
| Viewer | Manager or clinician | View datasets, analyses and reports |

The backend enforces these permissions. The frontend mirrors them to hide actions a user cannot take.

## 4. Goals and non-goals

Goals:
- Answer common hospital data questions without code.
- Lead with the finding, and show evidence, method and limitations every time.
- Keep each organisation's data separate and private.
- Be honest: never present sample data or unconfirmed results as real.

Non-goals (for now):
- Clinical decision support for individual patients.
- Causal claims. Results describe associations.
- Real-time integration with hospital record systems.
- Cleaning or editing datasets inside the product. The quality report recommends fixes, it does not apply them.

## 5. What is built today

### 5.1 Landing site
- Hero with the product screenshot directly below it, then the introduction, capabilities, how it works, privacy and security, the final call to action, and the footer.
- Sign In goes to `/login`, Get Started goes to `/register`.

### 5.2 Accounts and sessions
- Registration creates the user, the organisation and its first administrator in one step.
- Sign-in, sign-out and session restore use the backend contract (`shared/contracts/openapi.yaml`).
- Sessions use HTTP-only cookies. The CSRF token is sent on every write. An expired access token is refreshed once, automatically. No token is stored in browser storage.
- The browser calls `/api/v1/*` on the frontend's own origin. A route handler forwards those calls to the backend in `HOSPTIC_API_URL`.

### 5.3 Signed-in workspace (`/app`)
- Shows only the organisation's own datasets, loaded from the backend.
- First use: an empty state that leads with Upload dataset.
- Upload: CSV or XLSX, checked in the browser first, then validated and profiled by the backend. The upload result shows rows, columns and data quality notes.
- Ask questions about an uploaded dataset in plain language. The backend chooses the method, computes the statistics and explains them. Starter questions are built from the dataset's own columns.
- Ask for a report after an analysis to create a PDF, listed under Reports and downloadable by the organisation.
- Datasets can be deleted by roles allowed to upload. Conversations stay in the browser, because the backend has no conversation resource.
- Organisation name, initials and role come from the session.

### 5.4 Backend capabilities (available through the API)
- Organisation, membership and role management, with row-level security in PostgreSQL. A query without an organisation context returns no rows.
- Dataset upload, preview (personal-data columns masked), quality report and deletion.
- Analysis: the AI service chooses a method from column names and types only, never row values. The backend validates that choice and computes the statistics itself. Then the AI service explains the computed results, and the explanation is checked against the numbers.
- Supported methods: descriptive statistics, Welch t-test, paired t-test, one-way ANOVA, chi-square, Pearson, Spearman, simple linear regression.
- PDF reports for completed analyses.

## 6. Requirements for answers

Every answer must contain, in this order:
1. **Main finding**: one sentence, the visual anchor.
2. **Plain explanation**: what the numbers mean, without jargon.
3. **Evidence**: a chart and, where useful, a table.
4. **Interpretation**: what it means and what it does not show.
5. **Technical details**: method, assumptions and limitations, collapsed by default.
6. **Next questions**: suggested follow-ups.

If the backend cannot produce a checked explanation, the answer shows the statistics and the limitations, and says why there is no explanation.

## 7. Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Backend contract, auth, sessions, protected workspace, error handling | Done |
| 1b | Honest live workspace, dataset upload, dashboard refinement | Done |
| 2 | Ask questions on uploaded data, render backend charts, PDF reports, dataset deletion | Done |
| 2b | Dataset preview and quality report screens. Retry failed analyses with `POST /analysis/{id}/retry` | Next |
| 4 | Member management, and an organisation picker for users in several organisations | Planned |

## 8. Privacy and security requirements

- Organisation isolation is enforced in the database, not only in the application.
- Columns that look like personal identifiers are masked in previews and never sent to the AI service. Detection currently uses column names only.
- No secrets in the repository. Configuration lives in the host environment.
- Signed-in screens show only the organisation's own data. The landing page screenshot uses sample data and says so.
- Statistical results describe associations and say so.

## 9. Measures of success

These are what to measure. No targets are set yet.
- Time from first upload to first checked answer.
- Share of analyses that complete, compared with those that fail, and why they fail.
- Share of answers that include an AI explanation that passed the number check.
- Weekly active organisations and questions asked per organisation.

## 10. Open questions

1. Deployment: confirm the same-origin proxy and the `HOSPTIC_API_URL` setting for production.
2. Logout revokes the refresh token, but the access token stays valid for up to 15 minutes. Is that acceptable?
3. The complete list of backend error codes, especially for suspended members, rate limits and refresh failures.
4. Conversations: the backend stores analyses but has no conversation or thread resource. Should threads stay on the device, or get a backend model?
5. How natural questions map to analysis types, and what users see when the AI service is not configured.
6. Invitations: adding a member needs an existing account. Is an email invitation flow needed?

## 11. Constraints

- Frontend: Next.js App Router, JavaScript and JSX only, Tailwind CSS, Manrope, Hosptic brand colours.
- Backend: Express, Prisma, PostgreSQL with row-level security, Z.ai.
- Contract: `shared/contracts/openapi.yaml` is the source of truth between frontend and backend.
