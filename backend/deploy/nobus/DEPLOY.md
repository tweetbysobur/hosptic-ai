# Deploy Hosptic AI on Nobus (one Ubuntu server)

Status: written from Nobus's public pages and a Nobus console screenshot. Not yet run end to end on a Nobus server, so treat the first deploy as a test run.

Everything runs on one server:

```
browser ──HTTPS──> Caddy :443 ──> Next.js frontend 127.0.0.1:3000 ──/api/v1/*──> Express API 127.0.0.1:4000 ──> PostgreSQL
```

Only Caddy is reachable from the internet. The frontend forwards `/api/v1/*` to the API, so login cookies stay on one domain.

## Before you start

1. Instance: Ubuntu 22.04 or 24.04, at least 2 GB RAM, 20 GB disk, with a keypair. Keep the `.pem` file Nobus gave you when you created the keypair.
2. Security group: open inbound TCP 22 (SSH), 80 and 443. Without 80 open, Caddy cannot get a certificate.
3. A domain. Point an A record (for example `app.yourdomain.com`) at the instance's public IP. No domain yet? Use `<ip-with-dashes>.sslip.io`, e.g. `203-0-113-10.sslip.io`. It resolves to that IP with no setup, and Caddy can get a real certificate for it.
4. Your Z.ai key, if you want AI answers.

## Steps

1. Log in from your computer (Windows PowerShell, macOS or Linux terminal):

```bash
ssh -i path/to/your-key.pem ubuntu@<server-ip>
```

   On macOS/Linux run `chmod 600 your-key.pem` first if ssh says the key is too open. If `ubuntu` is refused, try `root`.

2. Get the code:

```bash
sudo git clone https://github.com/tweetbysobur/hosptic-ai.git /opt/hosptic
```

   If the repo is private, create a GitHub token with read access and clone `https://<token>@github.com/tweetbysobur/hosptic-ai.git`, or copy the folder up with `scp -r`.

3. Run the setup script (Node 22, PostgreSQL, Caddy, firewall, swap, secrets):

```bash
sudo bash /opt/hosptic/backend/deploy/nobus/provision.sh
sudo chown -R hosptic:hosptic /opt/hosptic
```

4. Edit `/etc/hosptic/backend.env` with `sudo nano /etc/hosptic/backend.env`:
   - `FRONTEND_URL=https://<your-domain>`
   - `ZAI_API_KEY=<your key>` (leave empty to run without AI)

5. Backend: install, migrate, create the restricted database role:

```bash
cd /opt/hosptic/backend
sudo -u hosptic npm ci --omit=dev
sudo -u hosptic bash -c 'set -a; . /etc/hosptic/backend.env; set +a; npx prisma migrate deploy'
APP_PW=$(sudo grep '^APP_DB_PASSWORD=' /etc/hosptic/backend.env | cut -d= -f2)
sudo -u postgres psql -d hosptic -v app_password="'$APP_PW'" -f sql/create-app-role.sql
sudo cp deploy/nobus/hosptic-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hosptic-api
curl -s localhost:4000/api/v1/health
```

   The last line should print `{"success":true,"data":{"status":"ok"}}`.

6. Frontend: install, build, start:

```bash
cd /opt/hosptic
sudo -u hosptic npm ci
sudo -u hosptic npm run build
sudo cp backend/deploy/nobus/hosptic-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hosptic-web
curl -s localhost:3000/api/v1/health
```

   The build takes a few minutes on a small server.

7. HTTPS: put your domain in the Caddyfile and load it:

```bash
sudo sed -i 's/app.example.com/<your-domain>/' /opt/hosptic/backend/deploy/nobus/Caddyfile
sudo cp /opt/hosptic/backend/deploy/nobus/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://<your-domain>/api/v1/health
```

   Then open `https://<your-domain>` in a browser and register.

8. Check isolation on the live database. Both columns must be `f`:

```bash
sudo -u postgres psql -d hosptic -c "select rolsuper, rolbypassrls from pg_roles where rolname='hosptic_app'"
```

## When something fails

```bash
sudo journalctl -u hosptic-api -n 100 --no-pager
sudo journalctl -u hosptic-web -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

- Browser shows a certificate error or times out: port 80/443 not open in the Nobus security group, or DNS not pointing at the IP yet.
- `502` from Caddy: `hosptic-web` is not running.
- "The Hosptic service could not be reached": `hosptic-api` is not running.
- Build killed with no message: out of memory. Check `free -h` shows swap.

## Files and storage

- Uploaded datasets and reports are stored in `/var/lib/hosptic/storage` on local disk. Back it up. `GET /datasets/:id/download` returns 501 with local storage.
- Nobus Flexible Object Storage may speak S3. Ask Nobus support: "Does FOS offer an S3-compatible API with an endpoint, access keys, private containers and presigned URLs?" If yes, set `STORAGE_DRIVER=s3` and the `STORAGE_*` values, then restart. Test with a throwaway container first.

## Backups

Run nightly from cron as root. Copy the results off the server:

```bash
sudo -u postgres pg_dump hosptic | gzip > /var/backups/hosptic-$(date +%F).sql.gz
tar -czf /var/backups/hosptic-files-$(date +%F).tar.gz /var/lib/hosptic/storage
```

## Updating

```bash
cd /opt/hosptic && sudo -u hosptic git pull
cd backend && sudo -u hosptic npm ci --omit=dev
sudo systemctl restart hosptic-api   # runs migrations first
cd /opt/hosptic && sudo -u hosptic npm ci && sudo -u hosptic npm run build
sudo systemctl restart hosptic-web
```

If a release adds a table, run the two `APP_PW` / `create-app-role.sql` lines from step 5 again (from `/opt/hosptic/backend`).

## Known limit: rate limiting behind the frontend proxy

The frontend does not forward the client IP to the API (on purpose, so it cannot be spoofed). The API therefore sees every request as coming from 127.0.0.1, and the login limit (`AUTH_RATE_LIMIT_MAX`, default 20 per 15 minutes) is shared by all users. For a demo with a few users, add `AUTH_RATE_LIMIT_MAX=200` to `/etc/hosptic/backend.env` and restart `hosptic-api`. Fix properly before a real launch.

## Data location

Nobus states it operates Tier III data centres in Nigeria and Nairobi. Confirm with them which one hosts your server (the console shows the availability zone, e.g. `nobus-wa-az1 (los1)` for Lagos). Get this in writing for any real patient data.

## Before real patient data

- Use only synthetic data until you have a data protection review. The Z.ai service is hosted outside Nigeria. Column metadata and aggregate results go there.
- Limit SSH to your IP in the security group.
- Keep `/etc/hosptic/backend.env` out of backups you share.
