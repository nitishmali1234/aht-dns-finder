#!/bin/bash
set -e

EXTENSION_ID="ehigncibekleokaggpijaaahgjidikap"
INSTALL_DIR="$HOME/.acquia-dns-finder"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.acquia.dns_finder"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Acquia DNS Finder..."

mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/native_host.py" "$INSTALL_DIR/native_host.py"
chmod +x "$INSTALL_DIR/native_host.py"

cat > "$INSTALL_DIR/${HOST_NAME}.json" << EOF
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

mkdir -p "$NMH_DIR"
cp "$INSTALL_DIR/${HOST_NAME}.json" "$NMH_DIR/${HOST_NAME}.json"

echo ""
echo "Done! Load the build/ folder in Chrome as an unpacked extension."
echo "No extension ID needed — it's fixed for everyone."
