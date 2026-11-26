# Hosptic

Hosptic lets hospital teams ask questions about their own data in plain language and get answers they can check.

Live site: https://usehosptic.vercel.app

## What is in this repository

| Path | Contents |
| --- | --- |
| `app`, `components`, `lib`, `styles` | Frontend: Next.js App Router, JavaScript, Tailwind CSS |
| `backend` | API: Express, Prisma, PostgreSQL with row-level security, Z.ai |
| `shared/contracts` | OpenAPI contract between frontend and backend |
| `tests` | Unit tests and end-to-end checks |
| `PRD.md` | Product requirements and roadmap |

## Run the frontend

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The browser calls `/api/v1/*` on the frontend's own origin. A route handler forwards those calls to the backend named in `HOSPTIC_API_URL`. Set it in `.env.local`:

```
HOSPTIC_API_URL=http://localhost:4000
```

Without it, the site still loads, and sign-in says the service is not connected.

## Run the backend

See `backend/README.md`.

## Tests

```bash
npm test
```

End-to-end checks need a running frontend and backend. See `docs/integration/phase-1-report.md`.

## Deployment

Both apps run on Vercel and deploy on every push to `main`.

| Vercel project | Folder | Address |
| --- | --- | --- |
| `hosptic` | repository root | https://usehosptic.vercel.app |
| `hosptic-api` | `backend` | https://usehosptic-api.vercel.app |

- The website forwards `/api/v1/*` to the backend named in `HOSPTIC_API_URL`.
- The backend uses Neon for PostgreSQL and Cloudflare R2 for uploaded files. Its settings live in the `hosptic-api` environment variables.
- Database migrations run during each backend build.
