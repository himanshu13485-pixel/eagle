#!/usr/bin/env bash
# Eagle → workk.work deploy. Run from the repo root on the server:
#   sudo bash deploy/prod/deploy.sh
#
# Generates .env.workk with fresh secrets on first run (never overwrites it),
# then builds and starts the stack. Re-run after a `git pull` to update.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE="deploy/prod/docker-compose.workk.yml"
ENV_FILE=".env.workk"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Prerequisites ───────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "Docker not installed."
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing."

# ── 2. Env file ────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  say "Generating $ENV_FILE with fresh secrets…"
  gen() { openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40; }
  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(gen)
JWT_ACCESS_SECRET=$(gen)
JWT_REFRESH_SECRET=$(gen)
DEVICE_TOKEN_SECRET=$(gen)

PUBLIC_API_URL=https://workk.work
AGENT_PUBLIC_URL=https://workk.work
DASHBOARD_URL=https://workk.work/app

API_HOST_PORT=4100
DASHBOARD_HOST_PORT=8180
WEB_HOST_PORT=8181
EOF
  chmod 600 "$ENV_FILE"
  say "Secrets written to $ENV_FILE (chmod 600). Back this file up."
else
  say "$ENV_FILE already exists — leaving it alone."
fi

# ── 3. Data directory on /home ─────────────────────────────────────────────
# Docker's data-root is on the 70G / partition, shared with cPanel and the
# containers already running on this box. Eagle's Postgres + screenshots live
# on /home (522G free) instead so a full disk can't take the other sites down.
EAGLE_DATA="${EAGLE_DATA:-/home/eagle-app/data}"
mkdir -p "$EAGLE_DATA"/{postgres,screenshots,agent}
grep -q '^EAGLE_DATA=' "$ENV_FILE" || echo "EAGLE_DATA=$EAGLE_DATA" >> "$ENV_FILE"
say "Data directory: $EAGLE_DATA ($(df -h "$EAGLE_DATA" | awk 'NR==2{print $4}') free)"

# ── 3. Port check ──────────────────────────────────────────────────────────
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a
for p in "${API_HOST_PORT}" "${DASHBOARD_HOST_PORT}" "${WEB_HOST_PORT}"; do
  if ss -ltn 2>/dev/null | grep -q ":${p} "; then
    die "Port ${p} is already in use on this server. Change it in $ENV_FILE (and in the nginx site) and re-run."
  fi
done
say "Ports ${API_HOST_PORT}/${DASHBOARD_HOST_PORT}/${WEB_HOST_PORT} are free."

# ── 4. Build + start ───────────────────────────────────────────────────────
say "Building images (first run pulls Node/Postgres/nginx — takes a few minutes)…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" build

say "Starting the stack…"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d

say "Waiting for the API to answer…"
# There is no /health route, so "answering at all" is the readiness signal:
# any HTTP status (including 404) means Nest is listening; 000 means it is not.
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
         "http://127.0.0.1:${API_HOST_PORT}/api/auth/login" 2>/dev/null || echo 000)
  if [ "$code" != "000" ]; then
    say "API is up on 127.0.0.1:${API_HOST_PORT} (HTTP $code)"
    break
  fi
  [ "$i" = 60 ] && die "API did not come up. Check: docker compose -f $COMPOSE logs api"
  sleep 2
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps

cat <<'NEXT'

Next steps (once, on this server):
  1. Create workk.work in WHM (Create a New Account), plus the `app` and `api`
     subdomains in that account's cPanel.
  2. Point Apache at the containers (cPanel userdata includes):
       bash deploy/prod/setup-cpanel-apache.sh
     then issue TLS via WHM » Manage AutoSSL » Run AutoSSL.
  3. Seed the first org/owner login — see deploy/prod/README.md.
NEXT
