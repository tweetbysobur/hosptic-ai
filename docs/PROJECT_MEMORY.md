# Project memory

Read this first in a new chat. Update it at the end of each session.

## What this is
Hosptic AI: hospital data analysis app.
- Frontend: Next.js 16 (repo root, `app/`). Proxies `/api/v1/*` to the backend named in `HOSPTIC_API_URL`.
- Backend: Express + Prisma + PostgreSQL with row-level security (`backend/`). Z.ai for AI answers.

## Deployment: Nobus (nobus.io), in progress
- Guide: `backend/deploy/nobus/DEPLOY.md`. Files: `provision.sh`, `hosptic-api.service`, `hosptic-web.service`, `Caddyfile`.
- Layout: Caddy :443 -> Next.js 127.0.0.1:3000 -> API 127.0.0.1:4000 -> PostgreSQL, all on one server.
- Instance created (2026-11-25): name `hosptic`, Ubuntu 24, public IP <server-public-ip>, keypair (name kept out of the repository), zone nobus-wa-az1 (los1, Lagos), status Active.
- Next step for the user: open ports 22/80/443 in the security group, SSH in, follow DEPLOY.md from step 2.
  No domain yet: use `203-0-113-10.sslip.io`.
- Known limit: frontend proxy does not forward client IP, so API rate limits are shared by all users. Raise `AUTH_RATE_LIMIT_MAX` for demos.

## Session log
- 2026-11-25: Adapted Nobus deploy kit for one-domain setup (added frontend service, Node 22, swap, sslip.io tip). Not yet run on the server.
