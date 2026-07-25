# Deployment

Live host: a DigitalOcean droplet running the app and Caddy under Docker
Compose. Not serverless — deliberately. An analysis run takes 10–15 minutes as
a detached background job and stores state in SQLite; both survive on a
long-running box with a mounted volume and neither survives a function
platform.

## Current deployment

| | |
| --- | --- |
| Droplet | `checkcompetition` (`587469420`), sgp1, s-1vcpu-2gb |
| IP | `168.144.102.11` |
| App directory | `/opt/checkcompetition` |
| Data volume | Docker volume `checkcompetition_reports` → `/data` |
| Firewall | `checkcompetition-fw` — inbound 22/80/443 only |
| Domain | `checkcompetition.org` (DNS on Cloudflare) |

Swap is enabled (2 GB). The droplet has 2 GB RAM and the Next.js build spikes
above it; without swap the build gets OOM-killed.

## DNS

The A record for `checkcompetition.org` must point at `168.144.102.11` and be
set to **DNS only (grey cloud), not proxied**. Two reasons:

1. Caddy obtains and renews the TLS certificate itself. Proxying puts
   Cloudflare's certificate in front and complicates the ACME challenge.
2. Cloudflare's proxy times out long-lived origin connections well before an
   analysis run finishes. The report page holds an SSE connection open for the
   whole run, so a proxied record would cut the live progress feed off partway
   through every time.

## Secrets

`/opt/checkcompetition/.env`, mode 600, never in git:

```
CLAUDE_MYLOBSTER_KEY=...   # required — runs cost real money
SITE_PASSWORD=...          # required — without it the site is open to the world
SITE_DOMAIN=checkcompetition.org
RATE_LIMIT_MAX=5
```

`SITE_PASSWORD` is what gates the site. Unset it and the gate silently turns
off, which is the right default locally and the wrong one here.

## Redeploy

```bash
ssh root@168.144.102.11
cd /opt/checkcompetition
git pull
docker compose up -d --build
```

The `reports` volume is not touched by a rebuild, so report history survives.

After redeploying, verify the gate from a machine with no session cookie:

```bash
for path in / /sample /analyze /api/analyze; do
  printf '%s -> ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://checkcompetition.org$path"
done
```

Expected: `/` 200, `/sample` 200, `/analyze` 307, `/api/analyze` 401. Anything
else means the allowlist in `proxy.ts` is wrong — a 200 on `/analyze` means the
site is open and spending is unbounded.

## Operating

```bash
docker compose ps                  # what is running
docker compose logs -f app         # app logs
docker compose logs -f caddy       # TLS / certificate issues
docker compose restart app
```

Inspect the database directly:

```bash
docker compose exec app node -e "const d=require('better-sqlite3')('/data/reports.db');console.log(d.prepare('SELECT id,status,created_at FROM reports ORDER BY created_at DESC LIMIT 10').all())"
```

## Cost

Roughly $12/month for the droplet, plus **~$7 of API spend per analysis run**.
The password gate is what keeps the second number bounded — see the Cost
section in `README.md` for the levers that reduce it.

## Backups

There are none. The report history lives only in the `checkcompetition_reports`
Docker volume on this one droplet. If that matters, enable DO volume snapshots
or copy `/data/reports.db` off the box on a schedule.
