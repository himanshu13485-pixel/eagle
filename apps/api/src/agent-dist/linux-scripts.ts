/**
 * Linux installer / uninstaller (.sh), shared by the per-employee downloads in
 * the dashboard. Mirrors the macOS scripts: validate before touching a running
 * install, report what actually happened, free the seat on removal.
 *
 * Autostart uses a systemd --user service (no root needed for that part); the
 * only step that wants sudo is installing the screenshot/idle helper packages,
 * and that is best-effort — a missing helper degrades a feature, it doesn't stop
 * the agent enrolling.
 *
 * Authored on Windows, so every CRLF is stripped: bash treats a stray '\r' as
 * part of the command ("$'\r': command not found").
 */

const AGENT_DIR = "$HOME/.eagle-agent";
const SERVICE = "workk-agent.service";
const UNIT = "$HOME/.config/systemd/user/workk-agent.service";

export function linuxInstallerScript(server: string, token: string, employeeName: string): string {
  const s = String.raw`#!/usr/bin/env bash
# Workk monitoring agent — Linux installer
set -u
SERVER="${server}"
TOKEN="${token}"
DIR="${AGENT_DIR}"
BIN="$DIR/eagle-agent"
UNIT="${UNIT}"

echo "Installing the Workk agent for ${employeeName}..."
mkdir -p "$DIR"

# --- screenshot / activity helpers (best-effort; agent still enrolls without) ---
# X11: imagemagick (capture+resize), scrot (fallback), xdotool + xprintidle
# (active window + idle). Wayland: grim (capture on wlroots). Package names vary
# by distro, so try the native manager and don't abort on failure.
echo "Installing helper tools (screenshots, activity)..."
if command -v sudo >/dev/null 2>&1; then SUDO=sudo; else SUDO=; fi
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -y >/dev/null 2>&1 || true
  $SUDO apt-get install -y imagemagick scrot xdotool xprintidle grim >/dev/null 2>&1 || true
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y ImageMagick scrot xdotool xprintidle grim >/dev/null 2>&1 || true
elif command -v yum >/dev/null 2>&1; then
  $SUDO yum install -y ImageMagick scrot xdotool xprintidle grim >/dev/null 2>&1 || true
elif command -v pacman >/dev/null 2>&1; then
  $SUDO pacman -Sy --noconfirm imagemagick scrot xdotool xprintidle xorg-xprop grim >/dev/null 2>&1 || true
elif command -v zypper >/dev/null 2>&1; then
  $SUDO zypper install -y ImageMagick scrot xdotool xprintidle grim >/dev/null 2>&1 || true
else
  echo "  (could not detect the package manager — install imagemagick, scrot, xdotool, xprintidle manually)"
fi

# --- download the agent to a side file and validate before replacing anything ---
echo "Downloading agent..."
URL="$SERVER/api/agent/binary?os=linux"
if command -v curl >/dev/null 2>&1; then
  curl -fSL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$BIN.new" "$URL"; RC=$?
elif command -v wget >/dev/null 2>&1; then
  wget -q -O "$BIN.new" "$URL"; RC=$?
else
  echo "ERROR: neither curl nor wget is installed. Install one and run this again."; exit 1
fi
if [ $RC -ne 0 ] || [ ! -s "$BIN.new" ]; then
  rm -f "$BIN.new"
  echo ""
  echo "ERROR: could not download the agent from $SERVER."
  echo "Check this machine is online and the server is reachable, then run this again."
  echo "Nothing was installed or changed."
  exit 1
fi
# An ELF starts with 0x7f 'E' 'L' 'F'; an HTML error page saved as the binary does not.
if [ "$(head -c 4 "$BIN.new" | tr -d '\0')" != "$(printf '\x7fELF')" ]; then
  rm -f "$BIN.new"
  echo "ERROR: the download was not a Linux program (the server may have sent an error page)."
  echo "Ask your Workk administrator to publish the Linux build. Nothing was changed."
  exit 1
fi

# --- stop any running agent, then install the new binary ---
systemctl --user stop "${SERVICE}" 2>/dev/null || true
pkill -f "$BIN" 2>/dev/null || true
mv -f "$BIN.new" "$BIN"
chmod +x "$BIN"

# --- autostart via a systemd --user service (starts on login; no root needed) ---
echo "Registering auto-start..."
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Workk Monitoring Agent
After=graphical-session.target

[Service]
Type=simple
# DISPLAY lets the X11 capture/idle tools reach the session on a single-seat PC.
Environment=DISPLAY=:0
ExecStart=$BIN --server $SERVER --token $TOKEN
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNITEOF

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload 2>/dev/null || true
  # So the service keeps running after logout / starts at boot on a shared PC.
  if command -v loginctl >/dev/null 2>&1; then loginctl enable-linger "$USER" >/dev/null 2>&1 || true; fi
  if systemctl --user enable --now "${SERVICE}" 2>/dev/null; then
    echo ""
    echo "Done. The Workk agent is installed and running."
  else
    # No user systemd (rare) — fall back to an XDG autostart entry + launch now.
    DESK="$HOME/.config/autostart"; mkdir -p "$DESK"
    cat > "$DESK/workk-agent.desktop" <<DESKEOF
[Desktop Entry]
Type=Application
Name=Workk Agent
Exec=$BIN --server $SERVER --token $TOKEN
X-GNOME-Autostart-enabled=true
DESKEOF
    DISPLAY=\${DISPLAY:-:0} nohup "$BIN" --server "$SERVER" --token "$TOKEN" >/dev/null 2>&1 &
    echo ""
    echo "Done. The Workk agent is installed and running (autostart via desktop entry)."
  fi
else
  DISPLAY=\${DISPLAY:-:0} nohup "$BIN" --server "$SERVER" --token "$TOKEN" >/dev/null 2>&1 &
  echo ""
  echo "Done. The Workk agent is running (no systemd found; it will not auto-start on reboot)."
fi

echo "On Wayland, screenshots need 'grim'; the active app and idle time need X11."
`;
  return s.replace(/\r\n?/g, "\n");
}

export function linuxUninstallerScript(server: string): string {
  const s = String.raw`#!/usr/bin/env bash
# Workk monitoring agent — Linux uninstaller
set -u
SERVER="${server}"
DIR="${AGENT_DIR}"
BIN="$DIR/eagle-agent"
UNIT="${UNIT}"

echo "Removing the Workk monitoring agent..."
if [ ! -e "$BIN" ] && [ ! -e "$UNIT" ] && [ ! -d "$DIR" ]; then
  echo "The Workk agent is not installed on this machine. Nothing to remove."
  exit 0
fi

# Free the seat on the server with the agent's own token (read before removal;
# plain sed, since a stock box may lack jq).
TOKEN=""
if [ -f "$DIR/config.json" ]; then
  TOKEN=$(sed -n 's/.*"deviceToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DIR/config.json" | head -n 1)
fi
SEAT="none"
if [ -n "$TOKEN" ]; then
  echo "Freeing the seat on the server..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --retry 3 --retry-delay 2 --max-time 15 -X POST -H "Authorization: Bearer $TOKEN" "$SERVER/api/devices/deactivate" >/dev/null 2>&1 && SEAT="freed" || SEAT="failed"
  fi
fi

# Stop and disable autostart before deleting files.
echo "Stopping the agent..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now workk-agent.service >/dev/null 2>&1 || true
fi
pkill -f "$BIN" 2>/dev/null || true
rm -f "$UNIT" "$HOME/.config/autostart/workk-agent.desktop"
command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload >/dev/null 2>&1 || true
rm -rf "$DIR"

sleep 1
PROBLEMS=0
if pgrep -f "$BIN" >/dev/null 2>&1; then echo "WARNING: the agent is still running."; PROBLEMS=1; fi
if [ -e "$DIR" ]; then echo "WARNING: could not remove $DIR"; PROBLEMS=1; fi

echo ""
if [ $PROBLEMS -eq 0 ]; then
  echo "Done. The Workk agent has been removed from this machine."
else
  echo "Finished with problems (see above). Reboot and run this again."
fi
case "$SEAT" in
  freed)  echo "Its seat has been freed on the server; history is kept." ;;
  failed) echo "Could not reach the server to free the seat. Deactivate this employee in the Workk dashboard instead." ;;
  none)   echo "No agent token was found, so no seat was freed." ;;
esac
[ $PROBLEMS -eq 0 ]
`;
  return s.replace(/\r\n?/g, "\n");
}
