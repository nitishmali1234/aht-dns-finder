# Building the .dmg installer

This is what you run on your own Mac to produce the final
`AHT Query Tool.dmg` file you hand to teammates.

You only need to do this when releasing a new version.
Teammates never run any of these steps — they just get the .dmg.

---

## Prerequisites (one-time, on your Mac)

1. **Node.js** — already installed if the rest of the project works
2. **Python 3 + Pillow** — only needed for icon generation:
   ```bash
   pip3 install Pillow
   ```
3. **Xcode Command Line Tools** — electron-builder needs these on Mac:
   ```bash
   xcode-select --install
   ```

---

## Step 1 — Frontend

Nothing to do here — the frontend is plain HTML/CSS/JS under
`frontend/public/` with no build step. The Electron app's backend serves
those files directly as-is.

---

## Step 2 — Install backend dependencies

The backend's `node_modules` folder gets bundled into the app:

```bash
cd backend
npm install
cd ..
```

---

## Step 3 — Generate icons (first time only)

```bash
cd electron-app/assets
chmod +x generate-icons.sh
./generate-icons.sh
cd ../..
```

This creates `assets/icon.png` and `assets/icon.ico`.
Replace `assets/icon-source.png` with a proper 1024x1024 logo
before doing this for a polished release.

---

## Step 4 — Install Electron build tools

```bash
cd electron-app
npm install
```

This downloads Electron itself (~100MB) — takes a minute the first time,
then it's cached.

---

## Step 5 — Build the .dmg

```bash
npm run build        # Mac only (.dmg for Intel + Apple Silicon)
npm run build:win    # Windows only (.exe installer)
npm run build:all    # Both at once
```

Output lands in `electron-app/dist/`:
```
electron-app/dist/
  AHT Query Tool-1.0.0-arm64.dmg   ← Apple Silicon Macs
  AHT Query Tool-1.0.0-x64.dmg     ← Intel Macs
  AHT Query Tool Setup 1.0.0.exe   ← Windows (if built)
```

---

## What the .dmg does when a teammate opens it

1. They double-click the `.dmg` — a window opens showing the app icon
   and an Applications folder shortcut (standard macOS pattern)
2. They drag the app icon into Applications — installed
3. They open it from Applications or Spotlight like any other app
4. The app starts the backend internally and opens the UI in its own
   window — no terminal, no Chrome extension, no browser needed
5. `aht` runs under their own login (their machine, their credentials)

---

## Gatekeeper warning (unsigned app)

Since this isn't signed with an Apple Developer certificate, macOS will
show: *"AHT Query Tool cannot be opened because it is from an
unidentified developer."*

Teammates bypass this once:
**Right-click the app → Open → Open**

After that first time, it opens normally. Ask IT if you want to look
into code signing (requires an Apple Developer account, ~$99/year) —
it's worth doing if this becomes a wider rollout.

---

## Releasing a new version

1. Update `"version"` in `electron-app/package.json`
2. Re-run steps 2 and 5 above (icons don't need to be regenerated)
3. Share the new `.dmg` — teammates drag the new app to Applications,
   replacing the old one (macOS will prompt to replace if the old one
   is already there)
