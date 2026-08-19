#!/usr/bin/env bash
# Point workk.work's cPanel vhost at the Eagle containers.
#
# Single-domain layout — one vhost, one certificate, no CORS:
#   workk.work/       -> web        (marketing)
#   workk.work/app    -> dashboard  (SPA built with base=/app/)
#   workk.work/api    -> api        (Nest already prefixes /api)
#   workk.work/socket.io -> api     (websocket upgrade)
#
# cPanel regenerates httpd.conf from templates, so hand-edited vhosts get wiped.
# The supported way is userdata include files, which is what this writes:
#   /etc/apache2/conf.d/userdata/{std,ssl}/2_4/<user>/workk.work/eagle.conf
#
# Prereq: workk.work must already exist in cPanel (as an addon domain under an
# existing account is fine — this auto-detects the owner).
#
#   sudo bash deploy/prod/setup-cpanel-apache.sh
set -euo pipefail

DOMAIN="${EAGLE_DOMAIN:-workk.work}"
API_PORT="${API_HOST_PORT:-4100}"
DASH_PORT="${DASHBOARD_HOST_PORT:-8180}"
WEB_PORT="${WEB_HOST_PORT:-8181}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -x /scripts/ensure_vhost_includes ] || die "This is not a cPanel server."

OWNER="$(/scripts/whoowns "$DOMAIN" 2>/dev/null || true)"
[ -n "$OWNER" ] || die "No cPanel account owns ${DOMAIN}. Add it as a domain in cPanel first."
say "${DOMAIN} is owned by cPanel user: ${OWNER}"

CONF="$(cat <<EOF
ProxyRequests Off
ProxyPreserveHost On
ProxyTimeout 3600

# Screenshot ingest accepts up to 12MB (ingest.controller.ts); leave headroom.
LimitRequestBody 16777216

# Socket.IO upgrade. The dashboard connects with transports:["websocket"] only,
# so without this live screen view fails outright — there is no polling fallback.
RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/?socket\.io/(.*) ws://127.0.0.1:${API_PORT}/socket.io/\$1 [P,L]

# Order matters: most specific path first, bare "/" last.
ProxyPass        /socket.io/ http://127.0.0.1:${API_PORT}/socket.io/
ProxyPassReverse /socket.io/ http://127.0.0.1:${API_PORT}/socket.io/

ProxyPass        /api/ http://127.0.0.1:${API_PORT}/api/
ProxyPassReverse /api/ http://127.0.0.1:${API_PORT}/api/
ProxyPass        /api  http://127.0.0.1:${API_PORT}/api
ProxyPassReverse /api  http://127.0.0.1:${API_PORT}/api

# The SPA is built with base=/app/, so it requests /app/assets/… — the trailing
# slashes here strip the prefix back off before it reaches the container.
RedirectMatch 301 ^/app\$ /app/
ProxyPass        /app/ http://127.0.0.1:${DASH_PORT}/
ProxyPassReverse /app/ http://127.0.0.1:${DASH_PORT}/

ProxyPass        / http://127.0.0.1:${WEB_PORT}/
ProxyPassReverse / http://127.0.0.1:${WEB_PORT}/
EOF
)"

# Every other site on this server shares this Apache. If the generated config
# is bad, a restart would take them all down — so write, test, and roll back
# automatically on failure, then reload gracefully instead of restarting.
WROTE=()
# The plain-HTTP vhost sends everything to HTTPS instead of serving it, so a
# visitor who types the bare domain does not stay on an unencrypted page.
# ACME challenges are excluded — redirecting them can break AutoSSL renewal.
REDIRECT="$(cat <<'EOF'
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^/?(.*) https://%{HTTP_HOST}/$1 [R=301,L]
EOF
)"

for mode in std ssl; do
  dir="/etc/apache2/conf.d/userdata/${mode}/2_4/${OWNER}/${DOMAIN}"
  mkdir -p "$dir"
  if [ "$mode" = "std" ]; then
    printf '%s

%s
' "$REDIRECT" "$CONF" > "${dir}/eagle.conf"
  else
    printf '%s
' "$CONF" > "${dir}/eagle.conf"
  fi
  WROTE+=("${dir}/eagle.conf")
  say "wrote ${dir}/eagle.conf"
done

rollback() {
  printf '
[1;31mConfig test failed — rolling back.[0m
' >&2
  for f in "${WROTE[@]}"; do rm -f "$f"; done
  /scripts/ensure_vhost_includes --all-users >/dev/null 2>&1 || true
  die "Apache config was left exactly as it was. Nothing restarted, no site affected."
}

say "Rebuilding vhost includes…"
/scripts/ensure_vhost_includes --all-users

say "Testing Apache config before touching the running server…"
apachectl configtest || rollback

# Graceful: finishes in-flight requests on the other sites instead of dropping
# them. No downtime for bookmyvessel / netvork / grapme.
say "Reloading Apache gracefully…"
apachectl graceful

say "Done. Next: WHM » Manage AutoSSL » Run AutoSSL to issue the certificate."
