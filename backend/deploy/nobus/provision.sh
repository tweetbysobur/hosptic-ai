#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04 server. Run as root: sudo bash provision.sh
# Installs Node 20, PostgreSQL, Caddy. Creates the owner and restricted database roles.
# Not yet run on a Nobus server. Read it before you run it.
set -euo pipefail

APP_DIR=/opt/hosptic
ENV_FILE=/etc/hosptic/backend.env

apt-get update
apt-get install -y curl ca-certificates gnupg postgresql postgresql-contrib debian-keyring debian-archive-keyring apt-transport-https git ufw

# Node.js 20
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# Service user and folders
id hosptic >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/hosptic --shell /usr/sbin/nologin hosptic
mkdir -p "$APP_DIR" /etc/hosptic /var/lib/hosptic/storage
chown -R hosptic:hosptic /var/lib/hosptic
chmod 700 /var/lib/hosptic/storage

# Database: owner role for migrations, restricted role for the running app
if [ ! -f "$ENV_FILE" ]; then
  OWNER_PW=$(openssl rand -hex 24)
  APP_PW=$(openssl rand -hex 24)
  su postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
CREATE ROLE hosptic_owner LOGIN PASSWORD '${OWNER_PW}';
CREATE DATABASE hosptic OWNER hosptic_owner;
SQL
  # Role and grants come from the repo script after migrations. Passwords are kept for the env file.
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=4000
TRUST_PROXY=1
DATABASE_URL=postgresql://hosptic_app:${APP_PW}@127.0.0.1:5432/hosptic
DIRECT_URL=postgresql://hosptic_owner:${OWNER_PW}@127.0.0.1:5432/hosptic
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
FRONTEND_URL=https://CHANGE-ME-frontend-address
COOKIE_SAMESITE=lax
COOKIE_SECURE=true
ZAI_API_KEY=
ZAI_API_BASE_URL=https://api.z.ai/api/paas/v4
ZAI_MODEL=glm-4.6
ZAI_TIMEOUT_MS=120000
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/lib/hosptic/storage
APP_DB_PASSWORD=${APP_PW}
ENV
  chown root:hosptic "$ENV_FILE"; chmod 640 "$ENV_FILE"
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Next: put the code in $APP_DIR, run deploy/nobus/DEPLOY.md steps 3 onward."
