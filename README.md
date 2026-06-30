# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status
for Acquia hosted applications. Opens in a full browser tab and runs a
DNS repointing check (`a:i`, `dc`, `do:li`) against a single application
in one click.

**No Acquia Cloud UI login, no API tokens, no manual "start the server"
step.** The extension talks to a tiny local backend that drives the
`aht` CLI directly — the same auth you already have configured for `aht`
on your machine. The backend runs as a background service that starts
itself at login and restarts itself if it ever dies. Even the one-time
backend setup happens from inside the extension itself — no terminal,
ever.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version, macOS |
| `aht` CLI | Installed and authenticated, on your `PATH` |
| `php` | Required by `aht`, on your `PATH` |

`python3` (preinstalled on macOS) is used once, automatically, to create
the backend's virtualenv — you don't run it yourself.

---

## Installation (one time)

### Step 1 — Load the extension in Chrome

1. Clone or download this repo
2. Open Chrome → go to **`chrome://extensions`**
3. Toggle **Developer mode** ON (top-right corner)
4. Click **Load unpacked**
5. Select the **`build`** folder inside this repo
6. Click the extension icon — it opens the app in a new tab

### Step 2 — Set up the backend (first run only)

The first time you click **Run Check**, if the local backend isn't
running yet, the extension shows a **"Backend Not Running"** card with a
single **Download Setup** button. No terminal commands, no typing:

1. Click **Download Setup** — saves `AcquiaDNSFinderSetup.pkg` to your Downloads
2. Open it from Downloads and click through the installer, exactly like
   installing any other Mac app
3. Come back to the extension tab and click **Run Check** again

That installer silently does the following for you:

- copies the backend to `~/Library/Application Support/AcquiaDNSFinder`
  (intentionally *not* run from wherever you cloned this repo — macOS
  blocks background/`launchd` processes from reading files under
  `Desktop`/`Documents`/`Downloads` unless you grant Full Disk Access;
  `Application Support` sidesteps that entirely)
- creates its Python virtualenv and installs dependencies
- registers a macOS LaunchAgent
  (`~/Library/LaunchAgents/com.acquia.aht-backend.plist`) that starts the
  backend at login (`RunAtLoad`) and restarts it if it ever crashes
  (`KeepAlive`), listening on `http://127.0.0.1:8001`

After that one click-through, you never touch it again — not even after
a restart.

> If `aht` or `php` aren't on your PATH yet, the installer exits without
> making changes. Get `aht` installed and authenticated first, then run
> the installer again.

---

## How to Use

1. Click the **Acquia DNS Finder** icon in your Chrome toolbar — opens in a new tab
2. Type the **application name / docroot** in the search box (e.g. `iqstudent`)
   - Application name only — no `@` prefix, no `.prod` suffix
3. Click **Run Check**
4. Results show:
   - Overall repointing status (complete or incomplete)
   - Per-environment details with load balancer EIP
   - Per-domain DNS check with expected vs actual IPs
   - A ready-to-paste Slack summary
   - Raw `aht` command output, for when you need to double check

---

## Updating

```
git pull
```

Go to `chrome://extensions` → find Acquia DNS Finder → click the
**reload icon** (↺). Only re-run the backend setup (click **Download
Setup** again in the extension) if `backend.py` itself changed — the
extension will tell you if the backend stops responding.

---

## Troubleshooting

**"Application Not Found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm the application exists in CCI under that name

**"Backend Not Running" / "Cannot reach the backend on port 8001"**
- Click **Download Setup** in that card and run the installer (see Installation above)
- If the installer doesn't fix it, check: `curl http://localhost:8001/docs`
- Check logs: `~/Library/Logs/aht-backend.log`, `aht-backend.err.log`,
  and `/tmp/acquia-dns-finder-install.log` (installer's own log)
- Confirm `aht` and `php` are on your PATH — the installer silently
  refuses to set anything up if either is missing

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

**Terminal alternative**
For debugging, or if you'd rather not use the `.pkg`, `./install.sh` in
the repo root does the exact same setup from a terminal.

---

## How it works

- **Frontend**: a React app, built and loaded as an unpacked Chrome
  extension (`manifest_version: 3`). Clicking the toolbar icon opens it
  in a new tab via a minimal background service worker.
- **Backend**: `backend.py` (FastAPI) shells out to the `aht` CLI,
  strips ANSI codes from its output, and parses it into structured
  JSON. It only listens on `127.0.0.1:8001` — never exposed externally.
- **Auth**: handled entirely by your existing local `aht` configuration.
  The extension never touches Acquia Cloud's UI, Okta, or any browser
  session/token — there is nothing to capture or expire.
- **Setup**: a Chrome extension can't install background services on
  its own (browser sandboxing prevents that, by design — otherwise any
  extension could silently run code on your machine). The extension's
  "Download Setup" button works around this the same way installing any
  other Mac app does: it downloads a `.pkg` (bundled inside the
  extension itself, built by `scripts/build-pkg.sh`) that you open once
  and click through. Its installer script is functionally identical to
  `install.sh`, just packaged for a GUI double-click instead of a
  terminal.

---

*Internal tool — Acquia T1 Support*
