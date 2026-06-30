# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status.
Opens in a full browser tab — enter the expected IP and the domain(s) to
check, and it tells you whether DNS has been repointed correctly.

**No backend, no CLI, no install script, no Acquia API, no token, no
login of any kind.** It uses a free, anonymous public DNS lookup
(Google's DNS-over-HTTPS resolver) straight from the browser. Clone the
repo, load the extension, done — nothing to configure.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |

That's it — no `aht`, no `php`, no Python, no local server, no Acquia
account or login of any kind.

---

## Installation (one time)

1. Clone this repo
2. Open Chrome → go to **`chrome://extensions`**
3. Toggle **Developer mode** ON (top-right corner)
4. Click **Load unpacked**
5. Select the **`build`** folder inside this repo
6. Click the extension icon — it opens the app in a new tab and works immediately

---

## How to Use

1. Click the **Acquia DNS Finder** icon in your Chrome toolbar — opens in a new tab
2. Enter the **expected IP address** — the correct EIP for this
   environment (e.g. from CCI)
3. Enter one or more **domains to check**, one per line (or comma-separated)
4. Click **Run Check**
5. Results show:
   - Overall repointing status (complete or incomplete)
   - Per-domain DNS check: expected vs. actual resolved IP
   - A ready-to-paste Slack summary
   - Raw DNS lookup data, for when you need to double check

You provide the expected IP yourself — the extension only checks live
DNS, it doesn't know anything about Acquia accounts or applications.

---

## Updating

```
git pull
```

Go to `chrome://extensions` → find Acquia DNS Finder → click the
**reload icon** (↺).

---

## Troubleshooting

**"Cannot reach DNS resolver" error**
- Check your internet connection — the extension calls Google's public
  DNS-over-HTTPS endpoint (`dns.google`), which needs outbound HTTPS access

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

---

## How it works

- **Frontend**: a React app, built and loaded as an unpacked Chrome
  extension (`manifest_version: 3`). Clicking the toolbar icon opens it
  in a new tab via a minimal background service worker.
- **Data**: `src/dnsCheck.js` calls `https://dns.google/resolve` — a
  free, public, unauthenticated DNS-over-HTTPS API — to look up the
  live A record(s) for each domain you enter, and compares them to the
  expected IP you provide.
- **No Acquia dependency**: there's no Acquia API call, no API token,
  no Acquia Cloud UI login. The tradeoff for zero setup and zero
  credentials is that you supply the expected IP yourself instead of
  the tool auto-fetching it from Acquia.

---

*Internal tool — Acquia T1 Support*
