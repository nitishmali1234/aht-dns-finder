#!/bin/bash
# Builds public/AcquiaDNSFinderSetup.pkg from backend.py.
#
# This is a MAINTAINER-only build step (run by whoever updates this repo),
# not something engineers run. The resulting .pkg is committed to the repo
# (via public/ -> build/) so the extension can offer it as a one-click,
# no-terminal download when it detects the backend isn't running.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$WORK_DIR/scripts"

{
  echo '#!/bin/bash'
  echo 'set -e'
  echo
  echo '# Acquia DNS Finder — backend setup (runs once, from the .pkg installer).'
  echo '# Postinstall scripts may run as root (via Installer.app) even for a'
  echo '# per-user install, so everything below explicitly targets the actual'
  echo '# logged-in console user rather than relying on $HOME/$USER.'
  echo
  echo 'CONSOLE_USER="$(/usr/bin/stat -f%Su /dev/console)"'
  echo 'if [ -z "$CONSOLE_USER" ] || [ "$CONSOLE_USER" = "root" ]; then'
  echo '  CONSOLE_USER="$(/usr/bin/logname 2>/dev/null || echo "$USER")"'
  echo 'fi'
  echo 'USER_HOME="$(/usr/bin/dscl . -read "/Users/${CONSOLE_USER}" NFSHomeDirectory 2>/dev/null | /usr/bin/awk "{print \$2}")"'
  echo '[ -z "$USER_HOME" ] && USER_HOME="$HOME"'
  echo
  echo 'LOG="/tmp/acquia-dns-finder-install.log"'
  echo 'echo "$(date) — setup starting for user: $CONSOLE_USER" > "$LOG"'
  echo
  echo 'run_as_user() {'
  echo '  if [ "$(id -un)" = "$CONSOLE_USER" ]; then'
  echo '    bash -lc "$1"'
  echo '  else'
  echo '    sudo -u "$CONSOLE_USER" bash -lc "$1"'
  echo '  fi'
  echo '}'
  echo
  echo 'AHT_PATH="$(run_as_user "command -v aht" 2>>"$LOG")" || true'
  echo 'PHP_PATH="$(run_as_user "command -v php" 2>>"$LOG")" || true'
  echo
  echo 'if [ -z "$AHT_PATH" ]; then'
  echo '  echo "ERROR: aht CLI not found on ${CONSOLE_USER}'"'"'s PATH." >> "$LOG"'
  echo '  exit 1'
  echo 'fi'
  echo 'if [ -z "$PHP_PATH" ]; then'
  echo '  echo "ERROR: php not found on ${CONSOLE_USER}'"'"'s PATH." >> "$LOG"'
  echo '  exit 1'
  echo 'fi'
  echo 'PHP_DIR="$(dirname "$PHP_PATH")"'
  echo 'AHT_DIR="$(dirname "$AHT_PATH")"'
  echo
  echo 'INSTALL_DIR="${USER_HOME}/Library/Application Support/AcquiaDNSFinder"'
  echo 'PLIST_PATH="${USER_HOME}/Library/LaunchAgents/com.acquia.aht-backend.plist"'
  echo 'LABEL="com.acquia.aht-backend"'
  echo
  echo 'mkdir -p "$INSTALL_DIR"'
  echo
  echo "cat > \"\${INSTALL_DIR}/backend.py\" << 'BACKEND_PY_EOF'"
  cat "$REPO_DIR/backend.py"
  echo   # guarantee a newline before the terminator even if backend.py has none
  echo "BACKEND_PY_EOF"
  echo
  echo 'chown -R "${CONSOLE_USER}:staff" "$INSTALL_DIR" 2>>"$LOG" || true'
  echo
  echo 'if [ ! -d "${INSTALL_DIR}/venv" ]; then'
  echo '  echo "Creating venv..." >> "$LOG"'
  echo '  run_as_user "python3 -m venv \"${INSTALL_DIR}/venv\"" >> "$LOG" 2>&1'
  echo 'fi'
  echo 'run_as_user "\"${INSTALL_DIR}/venv/bin/pip\" install --quiet --upgrade pip" >> "$LOG" 2>&1'
  echo 'run_as_user "\"${INSTALL_DIR}/venv/bin/pip\" install --quiet fastapi \"uvicorn[standard]\"" >> "$LOG" 2>&1'
  echo
  echo 'chown -R "${CONSOLE_USER}:staff" "$INSTALL_DIR" 2>>"$LOG" || true'
  echo
  echo 'mkdir -p "${USER_HOME}/Library/LaunchAgents"'
  echo 'cat > "$PLIST_PATH" << PLIST_EOF'
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  echo '<plist version="1.0">'
  echo '<dict>'
  echo '  <key>Label</key>'
  echo '  <string>${LABEL}</string>'
  echo '  <key>ProgramArguments</key>'
  echo '  <array>'
  echo '    <string>${INSTALL_DIR}/venv/bin/uvicorn</string>'
  echo '    <string>backend:app</string>'
  echo '    <string>--host</string>'
  echo '    <string>127.0.0.1</string>'
  echo '    <string>--port</string>'
  echo '    <string>8001</string>'
  echo '  </array>'
  echo '  <key>WorkingDirectory</key>'
  echo '  <string>${INSTALL_DIR}</string>'
  echo '  <key>EnvironmentVariables</key>'
  echo '  <dict>'
  echo '    <key>PATH</key>'
  echo '    <string>${PHP_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${AHT_DIR}</string>'
  echo '  </dict>'
  echo '  <key>RunAtLoad</key>'
  echo '  <true/>'
  echo '  <key>KeepAlive</key>'
  echo '  <true/>'
  echo '  <key>StandardOutPath</key>'
  echo '  <string>${USER_HOME}/Library/Logs/aht-backend.log</string>'
  echo '  <key>StandardErrorPath</key>'
  echo '  <string>${USER_HOME}/Library/Logs/aht-backend.err.log</string>'
  echo '</dict>'
  echo '</plist>'
  echo 'PLIST_EOF'
  echo
  echo 'chown "${CONSOLE_USER}:staff" "$PLIST_PATH"'
  echo
  echo 'UID_NUM="$(id -u "$CONSOLE_USER")"'
  echo 'launchctl bootout "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true'
  echo 'sleep 1'
  echo '# launchctl bootstrap can transiently fail right after a bootout'
  echo '# (I/O error) while launchd finishes unregistering the old service —'
  echo '# retry a few times before giving up.'
  echo 'BOOTSTRAP_OK=0'
  echo 'for attempt in 1 2 3 4 5; do'
  echo '  if launchctl bootstrap "gui/${UID_NUM}" "$PLIST_PATH" >> "$LOG" 2>&1; then'
  echo '    BOOTSTRAP_OK=1'
  echo '    break'
  echo '  fi'
  echo '  sleep 2'
  echo 'done'
  echo 'if [ "$BOOTSTRAP_OK" != "1" ]; then'
  echo '  echo "ERROR: launchctl bootstrap failed after retries." >> "$LOG"'
  echo '  exit 1'
  echo 'fi'
  echo
  echo 'sleep 2'
  echo 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/docs --max-time 5 >> "$LOG" 2>&1 || true'
  echo 'echo "$(date) — setup finished" >> "$LOG"'
  echo
  echo 'exit 0'
} > "$WORK_DIR/scripts/postinstall"

chmod +x "$WORK_DIR/scripts/postinstall"

OUT="$REPO_DIR/public/AcquiaDNSFinderSetup.pkg"
rm -f "$OUT"

pkgbuild \
  --nopayload \
  --scripts "$WORK_DIR/scripts" \
  --identifier "com.acquia.aht-backend.installer" \
  --version "1.0" \
  --install-location "/tmp" \
  "$OUT"

echo "Built: $OUT"
