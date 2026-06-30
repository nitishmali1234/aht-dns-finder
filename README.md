# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status
for Acquia hosted applications. Opens in a full browser tab and runs a
DNS repointing check against a single application in one click.

**No local backend, no CLI, no install script, no API token to generate
or paste in.** The extension calls the Acquia Cloud Platform API
directly from the browser, reusing whatever Acquia Cloud session is
already active in your browser — the same login you already use to
visit cloud.acquia.com day to day. Clone the repo, load the extension,
done.

> **Experimental auth.** This relies on your browser's existing Acquia
> Cloud session cookie rather than Acquia's officially documented OAuth
> token flow. It is not a supported integration pattern, and it may stop
> working without warning if Acquia changes how their session is
> structured. See [How it works](#how-it-works) for the specifics and
> the [Troubleshooting](#troubleshooting) section if it's not picking up
> your session.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |
| An active Acquia Cloud login | Just be logged into cloud.acquia.com in the same browser |

That's it — no `aht`, no `php`, no Python, no local server, no API key.

---

## Installation (one time)

1. Clone this repo
2. Open Chrome → go to **`chrome://extensions`**
3. Toggle **Developer mode** ON (top-right corner)
4. Click **Load unpacked**
5. Select the **`build`** folder inside this repo
6. Click the extension icon — it opens the app in a new tab

If you're already logged into Acquia Cloud in that browser, you're done
— just type an application name and run a check.

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
**reload icon** (↺).

---

## Troubleshooting

**"Not Signed In To Acquia Cloud"**
- Open cloud.acquia.com in the same Chrome profile/browser the extension
  is running in, log in, then come back and run the check again
- If you're already logged in and still see this, your Acquia session
  cookie likely isn't being sent on the extension's requests (commonly a
  `SameSite` cookie restriction) — see *Known limitation* below

**"Application Not Found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm the application exists in CCI under that name and that your
  Acquia account has access to it

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

**Known limitation**
Acquia's public REST API is documented as accepting only OAuth2 bearer
tokens, not browser session cookies. This extension works *if* Acquia's
API gateway happens to also honor the Cloud UI's session cookie for
these endpoints, and *if* that cookie's `SameSite` policy allows it to
be sent on a cross-origin request from a `chrome-extension://` page. If
either of those isn't true, every request will come back 401/403
regardless of being logged in, and there is currently no fallback —
that's the deliberate tradeoff for having zero tokens to manage.

---

## How it works

- **Frontend**: a React app, built and loaded as an unpacked Chrome
  extension (`manifest_version: 3`). Clicking the toolbar icon opens it
  in a new tab via a minimal background service worker.
- **Data**: `src/acquiaApi.js` talks directly to
  `https://cloud.acquia.com/api` — the same public Acquia Cloud Platform
  API v2 that backs the Acquia Cloud UI. It looks up the application,
  fetches each environment's expected IP(s), and checks each domain's
  live DNS resolution against them.
- **Auth**: every request is sent with `credentials: "include"`, so the
  browser attaches whatever Acquia session cookie already exists for
  `cloud.acquia.com` — no API key is ever requested, stored, or sent.
  Nothing is proxied through a third-party server; every request goes
  straight from your browser to Acquia.
- **Why no backend, why no token**: a Chrome extension can't install or
  run local background services on its own (browser sandboxing prevents
  that by design), which rules out driving a local CLI. Acquia's public
  REST API only documents OAuth2 bearer-token auth, which would mean
  asking every engineer to generate and paste in an API key. Reusing the
  existing Cloud UI session avoids both — at the cost of being an
  unofficial, best-effort technique rather than a documented one.

---

*Internal tool — Acquia T1 Support*
