#!/bin/bash
# generate-icons.sh — creates icon.png and icon.ico in this same folder

ASSETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 - "$ASSETS_DIR" << 'PYEOF'
import sys, os
from PIL import Image, ImageDraw

assets_dir = sys.argv[1]
source = os.path.join(assets_dir, "icon-source.png")

# Generate a simple placeholder icon if no real one exists yet
if not os.path.exists(source):
    img = Image.new("RGBA", (1024, 1024), (26, 35, 50, 255))
    draw = ImageDraw.Draw(img)
    draw.ellipse([112, 112, 912, 912], outline=(29, 161, 242, 255), width=60)
    draw.ellipse([250, 250, 774, 774], fill=(29, 161, 242, 200))
    img.save(source)
    print(f"Generated placeholder icon at {source}")

img = Image.open(source).convert("RGBA")

# macOS — 512x512 PNG (electron-builder converts this automatically)
out_mac = os.path.join(assets_dir, "icon.png")
img.resize((512, 512), Image.LANCZOS).save(out_mac)
print(f"Wrote {out_mac}")

# Windows — multi-size .ico
out_win = os.path.join(assets_dir, "icon.ico")
img.save(out_win, format="ICO", sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
print(f"Wrote {out_win}")

print("Done.")
PYEOF
