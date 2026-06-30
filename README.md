# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status
for Acquia hosted applications. Opens in a full browser tab and runs a
DNS repointing check against a single application in one click.

**No local backend, no CLI, no install script, nothing to run in a
terminal.** The extension calls the official **Acquia Cloud Platform
API** directly from the browser. The only one-time step is pasting your
own Acquia API Key/Secret into the extension's Settings panel — the same
kind of thing you'd do for any extension that needs to authenticate
(GitHub, Slack, etc.).

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |
| Acquia Cloud API Key/Secret | Generated once from Acquia Cloud UI (see below) |

That's it — no `aht`, no `php`, no Python, no local server.

---

## Installation (one time)

### Step 1 — Load the extension

1. Clone this repo
2. Open Chrome → go to **`chrome://extensions`**
3. Toggle **Developer mode** ON (top-right corner)
4. Click **Load unpacked**
5. Select the **`build`** folder inside this repo
6. Click the extension icon — it opens the app in a new tab

### Step 2 — Connect your Acquia account (first run only)

The first time you open the extension, it'll show a **"Connect Your
Acquia Account"** card right in the tab:

1. Go to **cloud.acquia.com** → your avatar (top right) → **Account
   Settings → API Tokens**
2. Click **Create Token**, then copy the **Key** and **Secret** shown
3. Paste both into the extension and click **Save Credentials**

That's stored locally in the browser via `chrome.storage` — it never
leaves your machine except to authenticate directly with Acquia. You
won't be asked again unless you uninstall the extension or clear its
storage. Revisit it any time via the gear icon in the top bar.

---

## How to Use

1. Click the **Acquia DNS Finder** icon in your Chrome toolbar — opens in a new tab
2. Type the **application name / docroot** in the search box (e.g. `iqstudent`)
   - Application name only — no `@` prefix, no `.prod` suffix
3. Click **Run Check**
4. Results show:
   - Overall repointing status (complete or incomplete)
   - Per-environment details with expected load balancer IP
   - Per-domain DNS check with expected vs. actual resolved IP
   - A ready-to-paste Slack summary
   - Raw Acquia API response data, for when you need to double check

---

## Updating

```
git pull
```

Go to `chrome://extensions` → find Acquia DNS Finder → click the
**reload icon** (↺). Your saved API credentials are untouched by updates.

---

## Troubleshooting

**"Application Not Found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm the application exists in CCI under that name and that your
  Acquia account has access to it

**"Connect Your Acquia Account" keeps showing up**
- Double check the Key/Secret were copied without extra whitespace
- Acquia API tokens don't expire by default, but can be revoked from the
  Acquia Cloud UI — generate a new one if needed

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

---

## How it works

- **Frontend**: a React app, built and loaded as an unpacked Chrome
  extension (`manifest_version: 3`). Clicking the toolbar icon opens it
  in a new tab via a minimal background service worker.
- **Data**: `src/acquiaApi.js` talks directly to
  `https://cloud.acquia.com/api` and `https://accounts.acquia.com` —
  the same public, official Acquia Cloud Platform API v2 that backs the
  Acquia Cloud UI and the `acli`/`aht` CLIs. It authenticates via OAuth2
  client-credentials using your API Key/Secret, looks up the
  application, fetches each environment's expected IP(s), and checks
  each domain's live DNS resolution against them.
- **Auth**: your API Key/Secret, entered once into the extension's own
  Settings panel and stored via `chrome.storage.local`. Nothing is
  proxied through a third-party server — every request goes straight
  from your browser to Acquia.
- **Why no backend**: a Chrome extension can't install or run local
  background services on its own (browser sandboxing prevents that by
  design). Calling Acquia's public REST API directly from the extension
  sidesteps the need for one entirely — clone, load unpacked, paste in
  an API key, done.

---

*Internal tool — Acquia T1 Support*
