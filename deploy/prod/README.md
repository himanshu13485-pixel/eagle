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

| Hostname | Serves | Container | Loopback port |
|---|---|---|---|
| `workk.work`, `www.workk.work` | marketing site | `web` | 8181 |
| `app.workk.work` | manager dashboard | `dashboard` | 8180 |
| `api.workk.work` | REST + Socket.IO + agent traffic | `api` | 4100 |

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
app    A   134.195.138.179
api    A   134.195.138.179
```

Wait for propagation (`dig +short api.workk.work`) before running AutoSSL —
AutoSSL validates over HTTP and fails if DNS hasn't landed.

### 2. Clone and deploy

```bash
cd /home/eagle            # or wherever you keep project checkouts
git clone https://github.com/himanshu13485-pixel/eagle.git
cd eagle
sudo bash deploy/prod/deploy.sh
```

The script generates `.env.workk` with fresh secrets on first run, checks the
three ports are free, builds the images and starts the stack. **Back up
`.env.workk`** — losing `DEVICE_TOKEN_SECRET` de-enrolls every agent.

### 3. cPanel domains + Apache proxy + TLS

First create the domains so Apache has vhosts to include into:
WHM » **Create a New Account** for `workk.work`, then inside that account's
cPanel » **Domains**, add `app.workk.work` and `api.workk.work`.

Then wire the vhosts to the containers:

```bash
sudo bash deploy/prod/setup-cpanel-apache.sh
```

cPanel regenerates `httpd.conf` from templates, so hand-edited vhosts get wiped.
The script writes proper userdata includes under
`/etc/apache2/conf.d/userdata/{std,ssl}/2_4/<user>/<domain>/eagle.conf`, which
survive rebuilds, then runs `ensure_vhost_includes` and restarts Apache.

Finally: WHM » **Manage AutoSSL** » Run AutoSSL to issue certificates.

### 4. First login
There is no production seed step — `POST /api/auth/register` is public, so
create the first org by signing up at `https://app.workk.work`. Lock down or
remove public registration before this is customer-facing.

### 5. The agent binary
`GET /api/agent/binary` streams the Windows agent, and the generated installer
`.bat` downloads from `AGENT_PUBLIC_URL`. Build the exe
(`npm run build:exe -w @eagle/agent`) and drop it on the `agentbin` volume at
`/data/agent/eagle-agent.exe`:

```bash
docker cp eagle-agent.exe eagle-api-1:/data/agent/eagle-agent.exe
```

It is unsigned, so SmartScreen will warn on every install until you sign it.

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
  token. Restrict to `https://app.workk.work`.
- **Schema sync uses `prisma db push`** on every boot. Once there is real
  customer data, switch to committed migrations + `prisma migrate deploy`.
- **Screenshot disk growth.** Retention (Basic 15d / Pro 30d / Business 60d)
  runs daily at 03:00, but watch `docker system df -v` early on — this is a
  shared server and a full disk takes the other projects down with it.
