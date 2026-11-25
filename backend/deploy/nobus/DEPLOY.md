# Deploy the backend on Nobus (one Ubuntu server)

Status: written from Nobus's public pages, not yet run on a Nobus server. Treat the first deploy as a test run. The files here are syntax-checked only.

What Nobus's site confirms: virtual servers with Ubuntu 22.04 and SSH key login. It does not mention Node.js hosting, Docker, git deploys, HTTPS certificates or S3-compatible storage, and PostgreSQL setup goes through their support team. This plan avoids all of those. It runs the app, PostgreSQL and the HTTPS proxy on one server you control.

## Before you start

1. Create a Nobus virtual server: Ubuntu 22.04, at least 2 GB RAM (the data library loads TensorFlow), 20 GB disk. Add your SSH key.
2. Ask Nobus to open ports 22, 80 and 443 in the server's security group.
3. Pick two addresses under one parent domain, for example `app.yourdomain.com` (frontend) and `api.yourdomain.com` (API). Point the API address at the server's public IP with an A record. Nobus offers DNS, or use your registrar.
4. Have your Z.ai key ready if you want AI answers.

Keep both addresses under one parent domain. Then the login cookies work with `COOKIE_SAMESITE=lax`. If you must use unrelated domains, set `COOKIE_SAMESITE=none`.

## Steps

1. Log in: `ssh -i key.pem ubuntu@<server-ip>`.
2. Get the code and run the setup script:

```bash
sudo git clone https://github.com/tweetbysobur/hosptic-ai.git /opt/hosptic
sudo bash /opt/hosptic/backend/deploy/nobus/provision.sh
```

   If the repo is private, use a deploy key or copy the folder with `scp`.

3. Edit `/etc/hosptic/backend.env`: set `FRONTEND_URL` to the real frontend address, and `ZAI_API_KEY`.
4. Install packages, migrate and create the restricted role:

```bash
cd /opt/hosptic/backend
sudo -u hosptic npm ci --omit=dev
set -a; . /etc/hosptic/backend.env; set +a
sudo -E -u hosptic npx prisma migrate deploy
sudo -u postgres psql -d hosptic -v app_password="'${APP_DB_PASSWORD}'" -f sql/create-app-role.sql
```

5. Start the API:

```bash
sudo cp deploy/nobus/hosptic-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hosptic-api
curl -s localhost:4000/api/v1/health
```

6. Turn on HTTPS. Edit `deploy/nobus/Caddyfile` with your API address, then:

```bash
sudo cp deploy/nobus/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://api.yourdomain.com/api/v1/health
```

   Caddy gets the certificate by itself. This needs the DNS record from "Before you start" and port 80 open.

7. Check isolation on the live database. This must print `f` for both columns:

```bash
sudo -u postgres psql -d hosptic -c "select rolsuper, rolbypassrls from pg_roles where rolname='hosptic_app'"
```

## Files and storage

- Uploaded datasets and reports are stored in `/var/lib/hosptic/storage`. This is local disk, so back it up (step below) and expect `GET /datasets/:id/download` to return 501.
- Nobus Flexible Object Storage may speak S3. Ask Nobus support: "Does FOS offer an S3-compatible API with an endpoint, access keys, private containers and presigned URLs?" If yes, set `STORAGE_DRIVER=s3` and the `STORAGE_*` values, then restart. Test with a throwaway container first.

## Backups

Run nightly from cron as root. Copy the results off the server, ideally to Nobus storage:

```bash
sudo -u postgres pg_dump hosptic | gzip > /var/backups/hosptic-$(date +%F).sql.gz
tar -czf /var/backups/hosptic-files-$(date +%F).tar.gz /var/lib/hosptic/storage
```

## Updating

```bash
cd /opt/hosptic && sudo git pull
cd backend && sudo -u hosptic npm ci --omit=dev
sudo systemctl restart hosptic-api   # runs migrations first
```

If a release adds a table, run the `create-app-role.sql` command from step 4 again.

## Data location

Nobus states it operates Tier III data centres in Nigeria and Nairobi. Confirm with them which one hosts your server. A Nigerian hospital will likely want Lagos. Get this in writing for any real patient data.

## Before real patient data

- Use only synthetic data until you have a data protection review. The Z.ai service is hosted outside Nigeria. Column metadata and aggregate results go there.
- Limit SSH to your IP in the security group.
- Keep `/etc/hosptic/backend.env` out of backups you share.
