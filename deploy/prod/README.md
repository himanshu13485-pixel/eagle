# Hosting Eagle on workk.work

Target: `srv.tradegeniusglobal.com` (134.195.138.179) — the AlmaLinux + cPanel/WHM
box that already runs bookmyvessel, grapme and netvork. Eagle sits alongside
them: its containers bind only to `127.0.0.1`, and Apache (managed by cPanel)
terminates TLS and routes by hostname.

Server facts that shaped this setup:
- Docker 26.1.3 already installed, with other containers running.
- 93G RAM — not a constraint.
- **Disk is the constraint.** `/` is 70G (50G free) and holds `/var/lib/docker`;
  `/home` is 765G (522G free). Eagle's Postgres and screenshots are bind-mounted
  to `/home/eagle-app/data` so they can't fill `/` and take the other sites down.
- Apache has `proxy`, `proxy_http`, `proxy_wstunnel` and `rewrite` loaded — all
  four are required.
- `workk.work` has **no DNS zone on this server**, so DNS lives at the registrar.

Single domain, path-routed — one vhost, one certificate, and no CORS because
the dashboard and API are same-origin:

| URL | Serves | Container | Loopback port |
|---|---|---|---|
| `workk.work/` | marketing site | `web` | 8181 |
| `workk.work/app` | manager dashboard | `dashboard` | 8180 |
| `workk.work/api` | REST + agent traffic | `api` | 4100 |
| `workk.work/socket.io` | realtime / live screen | `api` | 4100 |

Subdomains were the obvious layout, but every cPanel account on this box is at
its domain limit, so `workk.work` goes in as a single addon domain under an
existing account. Path routing needs one entry instead of four.

The dashboard is a Vite SPA that assumed it lived at the root; it is now built
with `base=/app/` (`VITE_BASE_PATH` build arg) and the router picks that up via
`import.meta.env.BASE_URL`. Local dev is unaffected — the base defaults to `/`.

Postgres has no published port — it is reachable only from the other containers.

## Why this differs from `infra/docker-compose.prod.yml`

The shipped prod compose does not survive contact with a real domain:

1. **MinIO presigned URLs are unreachable.** `StorageService.presignGet()` signs
   against `S3_ENDPOINT`, which the compose sets to `http://minio:9000` — a
   Docker-internal hostname. The browser cannot resolve it, so every screenshot
   in the dashboard renders broken. This stack drops MinIO and uses
   `STORAGE_DRIVER=local` on a named volume, served by the API at `/api/files/`.
2. **Ports bind to `0.0.0.0`** on `4000`/`8080`/`8081`, which both exposes the
   raw services publicly and collides with what already runs on this box.
   Everything here binds to `127.0.0.1` on `4100`/`8180`/`8181`.
3. **Named volumes land on `/`**, the 70G partition this server shares with
   cPanel. Screenshot growth would fill it. Data is bind-mounted to `/home`.

### Switching to S3/MinIO later
Local disk is fine until screenshot volume outgrows the server's disk. To move
to S3, set `STORAGE_DRIVER=s3` plus the `S3_*` vars — and make `S3_ENDPOINT` a
**publicly reachable** URL (e.g. `https://s3.workk.work` proxied to MinIO, or a
real S3/Spaces endpoint). The signature is computed over that host, so it must
be the same URL the browser will fetch.

## Runbook

### 1. DNS
There is no `workk.work` zone in `/var/named`, so this server is not the
nameserver — add these at the registrar where the domain was bought:

```
@      A   134.195.138.179
www    A   134.195.138.179
```

Wait for propagation (`dig +short workk.work`) before running AutoSSL —
AutoSSL validates over HTTP and fails if DNS hasn't landed.

### 2. Clone and deploy

The live checkout is **`/home/eagle-app`** — the same tree that holds the
bind-mounted data in `/home/eagle-app/data`. To update an existing deploy:

```bash
cd /home/eagle-app && git pull && sudo bash deploy/prod/deploy.sh
```

For a fresh box:

```bash
git clone https://github.com/himanshu13485-pixel/eagle.git /home/eagle-app
cd /home/eagle-app
sudo bash deploy/prod/deploy.sh
```

The script generates `.env.workk` with fresh secrets on first run, checks the
three ports are free, builds the images and starts the stack. **Back up
`.env.workk`** — losing `DEVICE_TOKEN_SECRET` de-enrolls every agent.

### 3. cPanel domains + Apache proxy + TLS

First create the domain so Apache has a vhost to include into. The cPanel
accounts on this server are at their domain limits, so add `workk.work` as an
**addon domain** inside an existing account (bookmyvessel) rather than creating
a new account: cPanel » **Domains** » Create A New Domain.

Then wire the vhosts to the containers:

```bash
sudo bash deploy/prod/setup-cpanel-apache.sh
```

cPanel regenerates `httpd.conf` from templates, so hand-edited vhosts get wiped.
The script writes proper userdata includes under
`/etc/apache2/conf.d/userdata/{std,ssl}/2_4/<user>/workk.work/eagle.conf`, which
survive rebuilds, then runs `ensure_vhost_includes` and restarts Apache. It
auto-detects the owning account with `/scripts/whoowns`, so it does not matter
which cPanel the addon domain lives under.

Finally: WHM » **Manage AutoSSL** » Run AutoSSL to issue certificates. cPanel
often issues a wildcard for the account automatically, in which case this is
already done — check with `openssl s_client -connect workk.work:443`.

The plain-HTTP vhost 301s everything to HTTPS, excluding `/.well-known/` so
AutoSSL renewal is not broken by the redirect. Re-run the script after any
certificate change; it is idempotent.

### 4. First login
There is no production seed step — `POST /api/auth/register` is public, so
create the first org by signing up at `https://workk.work/app`. Lock down or
remove public registration before this is customer-facing.

### 5. The Super Admin console
`PlatformAdmin` has no registration route and the dev seed does not create one,
so a fresh production database has an empty Super Admin console. Create the
first one inside the running container — credentials come from env so they are
never committed:

```bash
cd /home/eagle-app
docker compose --env-file .env.workk -f deploy/prod/docker-compose.workk.yml exec   -e ADMIN_EMAIL=admin@workk.work -e ADMIN_PASSWORD='your-password'   api node dist/bootstrap-admin.js
```

Then log in at `https://workk.work/app/admin/login`. Re-running with the same
email resets that admin's password, which is also the lockout recovery path.

### 6. The agent binary
`GET /api/agent/binary` streams the Windows agent, and the generated installer
`.bat` downloads from `AGENT_PUBLIC_URL`. Build the exe
(`npm run build:exe -w @eagle/agent`) and drop it on the `agentbin` volume at
`/data/agent/eagle-agent.exe`:

```bash
docker cp eagle-agent.exe eagle-api-1:/data/agent/eagle-agent.exe
```

It is unsigned, so SmartScreen will warn on every install until you sign it.

### 7. ffmpeg (only if you use webcam snapshots)
Webcam capture shells out to ffmpeg, which agents download once from
`GET /api/agent/ffmpeg`. Nothing ships it, so that route 404s until you put a
Windows build on the `agentbin` volume — and agents fail *silently* when it
does, skipping the webcam and sending a plain screenshot.

```bash
scp ffmpeg.exe root@<server>:/home/eagle-app/data/agent/ffmpeg.exe
```

`AGENT_FFMPEG_PATH` already points there in the compose file.

**Licensing:** serving ffmpeg to agents is redistribution. Use an LGPL build
and keep its licence notice, or the GPL build only if you accept the GPL
obligations for what you distribute alongside it. Check this before shipping to
customers.

Webcam also has to be switched on per organisation under
**Settings → Webcam Photos**; it is off by default and is opt-in by design.

## Operations

```bash
# from the repo root
C=deploy/prod/docker-compose.workk.yml
docker compose --env-file .env.workk -f $C ps
docker compose --env-file .env.workk -f $C logs -f api
docker compose --env-file .env.workk -f $C restart api

# update to the latest code
git pull && sudo bash deploy/prod/deploy.sh

# database backup (do this on a cron)
docker compose --env-file .env.workk -f $C exec -T postgres \
  pg_dump -U eagle eagle | gzip > eagle-$(date +%F).sql.gz
```

## Known gaps to close before customers

- **CORS is wide open** — `main.ts` uses `enableCors({ origin: true })` and the
  socket gateway does the same, so any website can call the API with a stolen
  token. The single-domain layout means the dashboard itself never needs CORS,
  so this can be tightened to `https://workk.work` with nothing to lose.
- **Schema sync uses `prisma db push`** on every boot. Once there is real
  customer data, switch to committed migrations + `prisma migrate deploy`.
- **Screenshot disk growth.** Retention (Basic 15d / Pro 30d / Business 60d)
  runs daily at 03:00, but watch `docker system df -v` early on — this is a
  shared server and a full disk takes the other projects down with it.
