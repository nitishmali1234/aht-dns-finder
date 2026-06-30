#!/bin/bash
# One-time setup for Acquia DNS Finder.
#
# Installs the local backend (which drives the `aht` CLI) as a macOS
# LaunchAgent so it starts automatically at login and restarts itself
# if it ever crashes — no terminal, no manual "start the server" step,
# ever again.
#
# The backend is copied to ~/Library/Application Support, NOT run from
# wherever you cloned this repo. macOS blocks background (launchd)
# processes from reading files under Desktop/Documents/Downloads
# unless you grant Full Disk Access — copying to Application Support
# sidesteps that entirely, regardless of where this repo lives.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/Library/Application Support/AcquiaDNSFinder"
PLIST_PATH="$HOME/Library/LaunchAgents/com.acquia.aht-backend.plist"
LABEL="com.acquia.aht-backend"

echo "======================================"
echo "  Acquia DNS Finder — Backend Setup"
echo "======================================"
echo

command -v aht >/dev/null 2>&1 || {
  echo "ERROR: 'aht' CLI not found on your PATH."
  echo "Install/configure it first (it's what this tool drives)."
  exit 1
}
command -v php >/dev/null 2>&1 || {
  echo "ERROR: 'php' not found on your PATH (required by 'aht')."
  exit 1
}
AHT_PATH="$(command -v aht)"
PHP_DIR="$(dirname "$(command -v php)")"

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/backend.py" "$INSTALL_DIR/backend.py"

if [ ! -d "$INSTALL_DIR/venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$INSTALL_DIR/venv"
fi

echo "Installing backend dependencies..."
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet fastapi "uvicorn[standard]"

echo "Writing LaunchAgent..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${INSTALL_DIR}/venv/bin/uvicorn</string>
    <string>backend:app</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>8001</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PHP_DIR}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$AHT_PATH")</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/aht-backend.log</string>

  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/aht-backend.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

sleep 2
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/docs --max-time 5 | grep -q 200; then
  echo
  echo "Backend is running on http://localhost:8001 and will auto-start at every login."
else
  echo
  echo "WARNING: backend did not respond. Check the logs:"
  echo "  $HOME/Library/Logs/aht-backend.err.log"
fi

echo
echo "--------------------------------------"
echo "  NEXT STEP (one time only in Chrome):"
echo
echo "  1. Open Chrome"
echo "  2. Go to: chrome://extensions"
echo "  3. Enable Developer Mode (top-right toggle)"
echo "  4. Click Load unpacked"
echo "  5. Select this folder:"
echo "     $SCRIPT_DIR/build"
echo "--------------------------------------"
