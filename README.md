# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status for Acquia hosted applications. No backend server required — everything runs locally on your Mac.

---

## Prerequisites

Make sure you have these before starting:

| Requirement | How to check |
|---|---|
| Google Chrome | Open Chrome — if it opens, you're good |
| Python 3 | Open Terminal → type `python3 --version` |
| `aht` CLI | Open Terminal → type `aht --version` |

> If `aht` is not found, install it from the internal Support-Tools repo first.

---

## Installation

### Step 1 — Get the project

**Option A: Git clone**
```
git clone <repo-url>
```

**Option B: Download ZIP**
- Download the ZIP from the repo
- Unzip it anywhere on your Mac (Desktop is fine)

---

### Step 2 — Run the installer

1. Open the project folder in Finder
2. **Double-click `install.command`**
3. A Terminal window opens and runs automatically
4. Wait for it to print **"Backend installed successfully"**

> If macOS blocks it with *"cannot be opened because it is from an unidentified developer"*:
> Right-click `install.command` → click **Open** → click **Open** again

---

### Step 3 — Load the extension in Chrome

1. Open Chrome and go to: **`chrome://extensions`**
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Navigate to the project folder and select the **`build`** folder inside it
5. Click **Select**

You should now see **Acquia DNS Finder** listed in your extensions.

---

### Step 4 — Pin it to your toolbar (recommended)

1. Click the puzzle piece icon in the Chrome toolbar
2. Find **Acquia DNS Finder**
3. Click the pin icon next to it

---

## How to Use

1. Click the **Acquia DNS Finder** icon in your Chrome toolbar — a new tab opens
2. Type the **application name** in the search box (e.g. `iqstudent`)
   - Application name only — no `@` prefix, no `.prod` suffix
3. Click **Run Check**
4. Results show:
   - Overall repointing status (complete or incomplete)
   - Environment details with EIPs and balancer info
   - Per-domain DNS check with expected vs actual IPs

---

## Updating

When a new version is released:

1. Pull the latest changes (`git pull`) or download the new ZIP
2. Double-click **`install.command`** again
3. Go to `chrome://extensions` → find Acquia DNS Finder → click the **reload icon** (↺)

No need to remove and re-add the extension.

---

## Troubleshooting

**"No environments found" error**
- Use only the application name (e.g. `iqstudent`, not `iqstudent.prod`)
- Confirm the application exists in CCI

**"Native host error" or blank results**
- Make sure you ran `install.command` first
- Try removing the extension from Chrome and re-loading the `build` folder

**`install.command` won't open**
- Right-click it → Open → Open (bypasses macOS security warning)

**`aht` not found during install**
- Confirm `aht` works in Terminal first: `aht --version`
- Make sure Support-Tools is installed before running the installer

---

## How it works

When you click Run Check, the extension talks to a small local Python script (`native_host.py`) using Chrome's built-in Native Messaging. That script runs `aht` commands on your Mac and sends results back to the browser tab. Nothing is sent to any external server — everything runs locally.

---

*Internal tool — Acquia T1 Support*
