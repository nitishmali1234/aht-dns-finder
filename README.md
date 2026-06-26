# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status for Acquia hosted applications.

**No Python, no terminal, no backend setup required.** Just load the extension and connect your Acquia Cloud API credentials once.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |
| Acquia Cloud account | For API credentials (see setup below) |

No `aht`, no Python, no Node.js needed.

---

## Installation

### Step 1 — Get the project

**Option A: Git clone**
```
git clone https://github.com/nitishmali1234/aht-dns-finder.git
```

**Option B: Download ZIP**
- Download the ZIP from the GitHub repo page
- Unzip it anywhere on your Mac (Desktop is fine)

---

### Step 2 — Load the extension in Chrome

1. Open Chrome → go to **`chrome://extensions`**
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Navigate to the project folder and select the **`build`** folder
5. Click **Select**

You should now see **Acquia DNS Finder** listed in your extensions.

That's it — no installer script to run.

---

### Step 3 — Pin it to your toolbar (recommended)

1. Click the puzzle piece icon in the Chrome toolbar
2. Find **Acquia DNS Finder**
3. Click the pin icon next to it

---

### Step 4 — Enter your Acquia Cloud API credentials (one-time)

The first time you open the extension, it will ask for your Acquia Cloud API credentials:

1. Go to **[cloud.acquia.com](https://cloud.acquia.com)**
2. Click your name (top-right) → **Account settings**
3. Click **API tokens** → **Create token**
4. Copy the **Key** and **Secret**
5. Paste them into the extension's setup screen and click **Save & Connect**

Credentials are stored locally in Chrome and never leave your browser.

---

## How to Use

1. Click the **Acquia DNS Finder** icon in your Chrome toolbar — a new tab opens
2. Type the **application name / docroot** in the search box (e.g. `iqstudent`)
   - Application name only — no `@` prefix, no `.prod` suffix
3. Click **Run Check**
4. Results show:
   - Overall repointing status (complete or incomplete)
   - Per-environment details with load balancer IP
   - Per-domain DNS check with expected vs actual IPs

---

## Updating

When a new version is released:

1. Pull the latest changes (`git pull`) or download the new ZIP
2. Go to `chrome://extensions` → find Acquia DNS Finder → click the **reload icon** (↺)

No credentials to re-enter — they're saved in Chrome storage.

---

## Troubleshooting

**"Application not found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm your API token has access to that application in cloud.acquia.com

**"Invalid API credentials" error**
- Click **API Settings** (top-right in the extension) to re-enter credentials
- Verify the Key and Secret are correct in cloud.acquia.com → Account settings → API tokens

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

---

## How it works

The extension calls the **Acquia Cloud API v2** (`cloud.acquia.com/api`) directly from Chrome using your stored API credentials. DNS resolution is performed using **Cloudflare DNS-over-HTTPS** (`1.1.1.1`). No local scripts, no native messaging, no Python backend.

---

*Internal tool — Acquia T1 Support*
