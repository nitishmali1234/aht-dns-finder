# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status
for Acquia hosted applications. Opens in a full browser tab and runs a
DNS repointing check (`a:i`, `dc`, `do:li`) against a single application
in one click.

**No Acquia Cloud UI login, no API tokens, no manual "start the server"
step.** The extension talks to a tiny local backend that drives the
`aht` CLI directly — the same auth you already have configured for `aht`
on your machine. The backend runs as a background service that starts
itself at login and restarts itself if it ever dies, so after a one-time
setup you never touch a terminal again.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |
| `aht` CLI | Installed and authenticated, on your `PATH` |
| `php` | Required by `aht`, on your `PATH` |
| `python3` | Used once by the installer to create the backend's virtualenv |

---

## Installation (one time)

### Step 1 — Get the project

```
git clone https://github.com/nitishmali1234/aht-dns-finder.git
cd aht-dns-finder
```

### Step 2 — Run the installer

```
./install.sh
```

This copies the backend to `~/Library/Application Support/AcquiaDNSFinder`,
creates its virtualenv, and registers a macOS LaunchAgent
(`~/Library/LaunchAgents/com.acquia.aht-backend.plist`) that:

- starts the backend automatically at login (`RunAtLoad`)
- restarts it automatically if it crashes (`KeepAlive`)
- runs on `http://127.0.0.1:8001`

The backend is intentionally copied out of wherever you cloned this repo.
macOS blocks background (`launchd`) processes from reading files under
`Desktop`/`Documents`/`Downloads` unless you grant Full Disk Access —
copying to `Application Support` avoids that entirely, regardless of
where you put this repo.

### Step 3 — Load the extension in Chrome

1. Open Chrome → go to **`chrome://extensions`**
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the **`build`** folder inside this repo
5. Click the extension icon — it opens the app in a new tab

That's it. No credentials to enter, nothing else to run, ever.

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
./install.sh        # only needed again if backend.py changed
```

Then go to `chrome://extensions` → find Acquia DNS Finder → click the
**reload icon** (↺) if `build/` changed.

---

## Troubleshooting

**"Application Not Found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm the application exists in CCI under that name

**"Cannot reach the backend on port 8001"**
- Check the backend is running: `curl http://localhost:8001/docs`
- Check logs: `~/Library/Logs/aht-backend.log` and `aht-backend.err.log`
- Re-run `./install.sh` to re-register the LaunchAgent

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

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

---

*Internal tool — Acquia T1 Support*
