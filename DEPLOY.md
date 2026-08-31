# Deploying Eagle to production

Local dev is zero-infra (SQLite + local file storage). Production uses **Postgres + S3/MinIO**.
The Prisma models are portable — the API Dockerfile swaps the datasource provider to
`postgresql` at build time, so no code changes are needed.

## Option A — build on the server

```bash
# on the VPS, in the repo root
export JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... DEVICE_TOKEN_SECRET=...
export PUBLIC_API_URL=https://api.yourdomain.com     # agents + presigned URLs use this
export AGENT_PUBLIC_URL=https://api.yourdomain.com
docker compose -f infra/docker-compose.prod.yml up -d --build
```

Services: API `:4000`, dashboard `:8080`, marketing `:8081`, Postgres, MinIO (`:9000`).
Put a reverse proxy (Caddy/Nginx/Traefik) in front for TLS and host routing.

## Option B — CI images from GHCR (matches the grapme flow)

`.github/workflows/docker.yml` builds and pushes `eagle-api`, `eagle-dashboard`,
`eagle-web` to `ghcr.io/<owner>/…` on every push to `master`. On the server, set
`image:` in the compose to those tags (drop `build:`) and `docker compose pull && up -d`.

## The agent binary in production

1. Build once: `npm run build:exe -w @eagle/agent` → `apps/agent/dist-bin/eagle-agent.exe`.
2. Ship it where the API can serve it — set `AGENT_EXE_PATH` in the API env, or bake the
   exe into the API image / mount it. `GET /api/agent/binary` streams it; the generated
   `.bat` (Employees → Get installer) downloads from `AGENT_PUBLIC_URL/api/agent/binary`.
3. `AGENT_PUBLIC_URL` must be reachable from every monitored PC (public domain or LAN IP).

## Notes / remaining hardening

- **Retention** runs daily at 03:00 (tier-based: Basic 15d, Pro 30d, Business 60d screenshots;
  90/90/180d activity). Trigger manually: `POST /api/admin/retention/run`.
- **Storage quota**: each plan also caps total screenshot bytes (Basic 5 GB, Pro 10 GB,
  Business 20 GB). Going over deletes the oldest screenshots until the org fits — checked on
  every upload and again in the nightly sweep. Limits live in `PLANS` in `@eagle/shared`, so
  the pricing page and the deletion code can't drift. `GET /api/admin/retention/storage`
  reports an org's current use. Rough sizing: a 1080p JPEG is ~250-400 KB, so 5 GB is roughly
  15k captures — about 10 seats at a 10-minute interval for the full 15-day Basic window.
- **Capture resolution**: screenshots are downscaled to 1080p tall by default
  (Settings → Screenshot Settings), so a 4K monitor doesn't cost ~4x the storage of a
  1080p one. Multi-monitor width is preserved; shorter screens are left alone.
- **Offline sync**: the agent buffers screenshots + activity under `~/.eagle-agent/buffer`
  when the API is unreachable and replays them on the next successful heartbeat.
- **Migrations**: the API uses `prisma db push` on boot (fine for a young schema). Switch to
  `prisma migrate deploy` + committed migrations before you have production data to protect.
- **Code signing**: `eagle-agent.exe` is unsigned → SmartScreen warns. Sign with an EV/OV
  cert (`signtool`) for silent installs.
