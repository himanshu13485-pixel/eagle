/**
 * macOS uninstaller (.command), shared by the public download on the marketing
 * site and the per-employee one in the dashboard so the two can't drift apart.
 *
 * Undoes exactly what the Mac installer does: the launchd auto-start, the
 * running process, and ~/.eagle-agent (binary, config, offline buffer).
 * Website blocking is Windows-only, so nothing system-wide is touched and no
 * admin password is needed.
 *
 * Like the installer, it checks what actually happened instead of printing
 * "Done" regardless — the Mac installer used to do exactly that.
 *
 * Written with String.raw so the sed backreferences survive, which means the
 * script must not use shell `${...}` (JS would interpolate it) — `$VAR` only.
 */
export function macUninstallerScript(server: string): string {
  const script = String.raw`#!/bin/bash
# Workk monitoring agent — macOS uninstaller
SERVER="${server}"
DIR="$HOME/.eagle-agent"
BIN="$DIR/eagle-agent"
PLIST="$HOME/Library/LaunchAgents/com.eagle.agent.plist"

echo "Removing the Workk monitoring agent..."

if [ ! -e "$BIN" ] && [ ! -e "$PLIST" ] && [ ! -d "$DIR" ]; then
  echo "The Workk agent is not installed on this Mac. Nothing to remove."
  exit 0
fi

# 1. Free the seat on the server with the agent's own token — read it before
#    the files go. A stock Mac has no jq, and python3 would trigger a developer
#    tools install prompt, so plain sed.
TOKEN=""
if [ -f "$DIR/config.json" ]; then
  TOKEN=$(sed -n 's/.*"deviceToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DIR/config.json" | head -n 1)
fi
SEAT="none"
if [ -n "$TOKEN" ]; then
  echo "Freeing the seat on the server..."
  if curl -fsS --retry 3 --retry-delay 2 --max-time 15 -X POST -H "Authorization: Bearer $TOKEN" "$SERVER/api/devices/deactivate" >/dev/null 2>&1; then
    SEAT="freed"
  else
    SEAT="failed"
  fi
fi

# 2. Remove auto-start BEFORE stopping the process — the job has KeepAlive,
#    so killing it first would just have launchd start it again.
echo "Stopping the agent..."
launchctl bootout "gui/$(id -u)/com.eagle.agent" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
pkill -f "$BIN" 2>/dev/null || true
rm -f "$PLIST"

# 3. Its files: binary, config, offline screenshot buffer.
echo "Deleting its files..."
rm -rf "$DIR"

# 4. Check rather than assume.
sleep 1
PROBLEMS=0
if pgrep -f "$BIN" >/dev/null 2>&1; then echo "WARNING: the agent is still running."; PROBLEMS=1; fi
if [ -e "$PLIST" ]; then echo "WARNING: could not remove $PLIST"; PROBLEMS=1; fi
if [ -e "$DIR" ]; then echo "WARNING: could not remove $DIR"; PROBLEMS=1; fi

echo ""
if [ $PROBLEMS -eq 0 ]; then
  echo "Done. The Workk agent has been removed from this Mac."
else
  echo "Finished with problems (see above). Restart the Mac and run this again."
fi
case "$SEAT" in
  freed)  echo "Its seat has been freed on the server; history is kept." ;;
  failed) echo "Could not reach the server to free the seat. Deactivate this employee in the Workk dashboard instead." ;;
  none)   echo "No agent token was found, so no seat was freed. Deactivate this employee in the Workk dashboard if needed." ;;
esac
echo "Optional: remove eagle-agent from System Settings > Privacy & Security > Screen Recording."
[ $PROBLEMS -eq 0 ]
`;
  // bash chokes on CRLF ("$'\r': command not found"); this repo is edited on
  // Windows, so never let a carriage return reach the Mac.
  return script.replace(/\r\n?/g, "\n");
}
