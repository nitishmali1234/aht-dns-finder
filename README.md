# Acquia DNS Finder

A Chrome Extension for T1 Support Engineers to check DNS repointing status
for Acquia hosted applications. Opens in a full browser tab and runs a
DNS repointing check against a single application in one click.

**No local backend, no CLI, no install script, no per-engineer login or
token.** The extension calls the Acquia Cloud Platform API directly from
the browser, authenticated with a single shared internal API
Key/Secret baked into the build. Clone the repo, load the extension,
done — nothing to configure.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Google Chrome | Any recent version |

That's it — no `aht`, no `php`, no Python, no local server, no personal
Acquia login or API key.

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

**"Acquia Connection Error"**
- The shared credentials baked into the build have been revoked or
  expired — this isn't something an individual engineer can fix; flag
  it to whoever maintains this repo (see *For maintainers* below)

**"Application Not Found" error**
- Use only the docroot name (e.g. `iqstudent`, not `@iqstudent` or `iqstudent.prod`)
- Confirm the application exists in CCI under that name and that the
  shared service account has access to it

**Extension shows blank / won't load**
- Go to `chrome://extensions` → reload the extension
- Make sure you loaded the `build/` folder, not the project root

---

## For maintainers — rotating the shared credentials

This extension authenticates with one shared Acquia API Key/Secret,
generated from a team/service Acquia Cloud account (Account Settings →
API Tokens), stored in `src/acquiaConfig.js`. If it's ever revoked or
needs rotating:

1. Generate a new token from the service account in Acquia Cloud UI
2. Update `ACQUIA_API_KEY` / `ACQUIA_API_SECRET` in `src/acquiaConfig.js`
3. `npm run build` (only the maintainer needs Node for this — `build/`
   is committed so engineers don't)
4. Commit and push — engineers pick it up on their next `git pull` +
   extension reload

This token is visible to anyone who inspects the extension's compiled
JS, by design — there is no way to ship a fully zero-setup, zero-login
extension without an embedded credential of some kind. Acceptable here
because distribution is internal-only and the service account should
be scoped to no more access than support already has.

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
- **Auth**: `src/acquiaConfig.js` holds a shared API Key/Secret used via
  Acquia's standard OAuth2 `client_credentials` flow
  (`accounts.acquia.com/api/auth/oauth/token`) to get a short-lived
  bearer token, refreshed automatically as needed. No engineer ever
  sees, enters, or manages a credential.
- **Why the header rule (`public/rules.json`)**: Acquia's identity
  provider (Okta-backed) rejects `client_credentials` token requests
  that carry a browser `Origin` header — it's a deliberate anti-abuse
  check that demands PKCE for anything it can tell came from a browser.
  A `declarativeNetRequest` rule strips the `Origin` header on just
  that one request before it leaves Chrome, so it's indistinguishable
  from a normal server-to-server call (the same reason a plain `curl`
  request works). This is the same header-rewriting mechanism used by
  extensions like ModHeader — no external server, no hosting, no
  account, purely client-side.
- **Why no backend**: a Chrome extension can't install or run local
  background services on its own (browser sandboxing prevents that by
  design), which rules out driving a local CLI directly. Calling
  Acquia's public REST API from the extension sidesteps that entirely.

---

*Internal tool — Acquia T1 Support*
