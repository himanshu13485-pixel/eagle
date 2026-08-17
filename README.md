# Eagle — Employee Monitoring & Productivity Platform

A SuperSee-equivalent workforce-visibility SaaS: screenshots, live screen view,
app & website usage, active/idle/offline time, timesheets, and productivity
reports — with a lightweight desktop agent installed on each monitored PC.

> Legitimate employer-owned-device monitoring (same category as Hubstaff / Time
> Doctor / ActivTrak). Scope: screens, app/website usage, idle/active time, live
> screen. **No keylogging.** Consent/disclosure is the deploying org's
> responsibility; every device is enrolled with a token issued from the dashboard.

## Monorepo layout

```
apps/
  api/         NestJS + Prisma + Socket.IO   — REST + realtime
  dashboard/   React + Vite + Tailwind        — manager app  (:5173)
  web/         React + Vite + Tailwind        — marketing site (:5174)
  agent/       Node + TS headless service     — the monitored-PC software
packages/
  shared/      shared TS types / enums / contracts
infra/
  docker-compose.yml   Postgres + Redis + MinIO
```

## Tech stack

Node + NestJS, PostgreSQL (Prisma), Redis, MinIO/S3 for screenshot storage,
Socket.IO for realtime, React + Vite + TailwindCSS + Recharts on the front end.

## First-time setup (zero-infra local dev)

Local dev uses **SQLite** (a file, no database server) and saves screenshots to a
local folder — no Docker, Redis, or MinIO needed. Backend env lives in
`apps/api/.env` (already provided).

```bash
# 1. Install deps
npm install

# 2. Create the SQLite schema + demo data
npm run db:generate
npm run db:push
npm run db:seed
```

Seed creates an org + login: **owner@eagle.test / eagle1234**.

> Production: switch `apps/api/prisma/schema.prisma` datasource to `postgresql`,
> point `DATABASE_URL` at Postgres, run `npm run db:migrate`, and swap the
> filesystem `StorageService` for the S3 implementation. The Docker compose in
> `infra/` (Postgres + Redis + MinIO) is kept for that path.

## Run the dev stack

Windows: double-click **`start-dev.bat`** (launches infra + API + dashboard + web
in separate windows). Or manually, in separate terminals:

```bash
npm run dev:api          # http://localhost:4000/api   (SQLite, no Docker)
npm run dev:dashboard    # http://localhost:5173
npm run dev:web          # http://localhost:5174
```

The API runs on **port 4000** (moved off 3000 to avoid clashing with other local
projects).

## Run a monitoring agent (screenshots end-to-end)

1. Log into the dashboard, open **Employees**, add one, then **Get install token**.
2. On the machine to monitor (Windows fully supported in this slice):

```bash
npm run agent -- --server http://localhost:4000 --token <ENROLL_TOKEN>
```

The agent enrolls, appears **online**, and starts capturing periodic +
app-switch screenshots and app/website usage. Watch the **Screenshots** page fill
in live. Change **Settings → Screenshot Settings** and the agent picks it up on
its next heartbeat.

## Roadmap (built vs next)

- **Done (Phase 0–1):** monorepo, infra, auth, employees/devices, screenshot
  ingest → MinIO, screenshots page (live), dashboard overview, settings→agent
  config, marketing site, headless agent (screenshots, app/idle tracking).
- **Next:** Phase 2 live streaming (Socket.IO frames → WebRTC) · Phase 3 reports
  (timesheet, app/website usage, productivity trends, work replay) · Phase 4
  teams/shifts/bulk-update/data-management/billing · Phase 5 agent service
  install + signed installers + Docker/ghcr deploy.
