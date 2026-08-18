#!/usr/bin/env bash
# Point workk.work's cPanel vhosts at the Eagle containers.
#
# cPanel regenerates httpd.conf from templates, so hand-edited vhosts get wiped.
# The supported way is userdata include files, which is what this writes:
#   /etc/apache2/conf.d/userdata/{std,ssl}/2_4/<user>/<domain>/eagle.conf
#
# Prereq: the three domains must already exist in cPanel (main domain +
# subdomains), so their vhosts exist to be included into.
#
#   sudo bash deploy/prod/setup-cpanel-apache.sh
set -euo pipefail

API_PORT="${API_HOST_PORT:-4100}"
DASH_PORT="${DASHBOARD_HOST_PORT:-8180}"
WEB_PORT="${WEB_HOST_PORT:-8181}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -x /scripts/ensure_vhost_includes ] || die "This is not a cPanel server."

# Which cPanel account owns workk.work?
OWNER="$(/scripts/whoowns workk.work 2>/dev/null || true)"
[ -n "$OWNER" ] || die "No cPanel account owns workk.work yet. Create it in WHM » Create a New Account first."
say "workk.work is owned by cPanel user: $OWNER"

# Proxy config for one hostname → one loopback port.
# ProxyPreserveHost keeps the Host header so the API builds correct links.
# The RewriteRule is the websocket upgrade path: the dashboard connects with
# transports:["websocket"] only, so without it live screen view fails outright.
emit() {
  local port="$1" ws="$2"
  cat <<EOF
ProxyRequests Off
ProxyPreserveHost On
ProxyTimeout 3600

EOF
  if [ "$ws" = "yes" ]; then
    cat <<EOF
RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/?(.*) ws://127.0.0.1:${port}/\$1 [P,L]

# Screenshot ingest accepts up to 12MB (ingest.controller.ts); leave headroom.
LimitRequestBody 16777216

EOF
  fi
  cat <<EOF
ProxyPass        / http://127.0.0.1:${port}/
ProxyPassReverse / http://127.0.0.1:${port}/
EOF
}

install_for() {
  local domain="$1" port="$2" ws="$3"
  for mode in std ssl; do
    local dir="/etc/apache2/conf.d/userdata/${mode}/2_4/${OWNER}/${domain}"
    mkdir -p "$dir"
    emit "$port" "$ws" > "${dir}/eagle.conf"
  done
  say "wrote include for ${domain} -> 127.0.0.1:${port}"
}

install_for "workk.work"     "$WEB_PORT"  "no"
install_for "app.workk.work" "$DASH_PORT" "no"
install_for "api.workk.work" "$API_PORT"  "yes"

say "Rebuilding Apache config…"
/scripts/ensure_vhost_includes --all-users
apachectl configtest || die "Apache config test failed — includes left in place for inspection."
/scripts/restartsrv_httpd

say "Done. Now run AutoSSL (WHM » Manage AutoSSL » Run AutoSSL) to issue certificates."
