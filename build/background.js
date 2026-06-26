chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

// Real Okta endpoints (from accounts.acquia.com/.well-known/openid-configuration)
const TOKEN_URL  = 'https://id.acquia.com/oauth2/default/v1/token';
const DEVICE_URL = 'https://id.acquia.com/oauth2/default/v1/device/authorize';

function post(url, params, sendResponse) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
    .then(async r => sendResponse({ ok: r.ok, status: r.status, body: await r.text() }))
    .catch(e  => sendResponse({ ok: false, status: 0, body: e.message }));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Tab injection auth ───────────────────────────────────────────────────
  // accounts.acquia.com allows client_credentials from Origin: cloud.acquia.com
  // but blocks chrome-extension:// origins. We inject a fetch into an open
  // cloud.acquia.com tab so the browser sends the right Origin header.
  if (msg.type === 'ACQUIA_TAB_AUTH') {
    (async () => {
      let tabId = null;
      let weCreatedTab = false;

      try {
        // 1. Use an existing cloud.acquia.com tab if one is open
        const existing = await chrome.tabs.query({ url: 'https://cloud.acquia.com/*' });

        if (existing.length > 0) {
          tabId = existing[0].id;
        } else {
          // 2. Open one silently in the background
          const newTab = await chrome.tabs.create({ url: 'https://cloud.acquia.com/', active: false });
          weCreatedTab = true;
          tabId = newTab.id;

          // Wait for it to finish loading (15 s timeout)
          const finalUrl = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Tab load timeout')), 15000);
            const listener = (id, info, tab) => {
              if (id === newTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(timer);
                resolve(tab.url);
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });

          // If redirected to login (id.acquia.com), user is not logged in
          if (!finalUrl?.startsWith('https://cloud.acquia.com/')) {
            sendResponse({ ok: false, status: 0, body: 'NOT_LOGGED_IN' });
            return;
          }
        }

        // 3. Execute the fetch inside the cloud.acquia.com tab
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: async (clientId, clientSecret) => {
            try {
              const r = await fetch('https://accounts.acquia.com/api/auth/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  grant_type:    'client_credentials',
                  client_id:     clientId,
                  client_secret: clientSecret,
                }).toString(),
              });
              return { ok: r.ok, status: r.status, body: await r.text() };
            } catch (e) {
              return { ok: false, status: 0, body: e.message };
            }
          },
          args: [msg.clientId, msg.clientSecret],
        });

        sendResponse(results[0].result);
      } catch (e) {
        sendResponse({ ok: false, status: 0, body: e.message });
      } finally {
        if (weCreatedTab && tabId) {
          setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 800);
        }
      }
    })();
    return true;
  }

  // ── Fallback: direct Okta endpoints ─────────────────────────────────────
  if (msg.type === 'ACQUIA_AUTH') {
    post(TOKEN_URL, {
      grant_type:    'client_credentials',
      client_id:     msg.clientId,
      client_secret: msg.clientSecret,
    }, sendResponse);
    return true;
  }

  if (msg.type === 'ACQUIA_DEVICE_START') {
    post(DEVICE_URL, { client_id: msg.clientId }, sendResponse);
    return true;
  }

  if (msg.type === 'ACQUIA_DEVICE_POLL') {
    post(TOKEN_URL, {
      grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
      client_id:   msg.clientId,
      device_code: msg.deviceCode,
    }, sendResponse);
    return true;
  }

  if (msg.type === 'ACQUIA_CODE_EXCHANGE') {
    post(TOKEN_URL, {
      grant_type:    'authorization_code',
      client_id:     msg.clientId,
      code:          msg.code,
      code_verifier: msg.codeVerifier,
      redirect_uri:  msg.redirectUri,
    }, sendResponse);
    return true;
  }

  if (msg.type === 'ACQUIA_REFRESH') {
    post(TOKEN_URL, {
      grant_type:    'refresh_token',
      client_id:     msg.clientId,
      refresh_token: msg.refreshToken,
    }, sendResponse);
    return true;
  }
});
