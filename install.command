#!/bin/bash
set -e

EXTENSION_ID="ehigncibekleokaggpijaaahgjidikap"
INSTALL_DIR="$HOME/.acquia-dns-finder"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.acquia.dns_finder"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  Acquia DNS Finder - Installer"
echo "======================================"
echo ""

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/native_host.py" "$INSTALL_DIR/native_host.py"
chmod +x "$INSTALL_DIR/native_host.py"

mkdir -p "$NMH_DIR"
cat > "$NMH_DIR/${HOST_NAME}.json" << EOF
{
  "name": "${HOST_NAME}",
  "description": "Acquia DNS Finder native host",
  "path": "${INSTALL_DIR}/native_host.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF

echo "  Backend installed successfully."
echo ""
echo "--------------------------------------"
echo "  NEXT STEP (one time only in Chrome):"
echo ""
echo "  1. Open Chrome"
echo "  2. Go to: chrome://extensions"
echo "  3. Enable Developer Mode (top-right toggle)"
echo "  4. Click Load unpacked"
echo "  5. Select this folder:"
echo "     $SCRIPT_DIR/build"
echo "--------------------------------------"
echo ""
read -p "Press Enter to close this window..."
