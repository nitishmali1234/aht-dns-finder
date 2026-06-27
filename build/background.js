chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

/* ── Find or open a logged-in cloud.acquia.com tab ─────────────────────── */
async function ensureAcquiaTab() {
  const existing = await chrome.tabs.query({ url: 'https://cloud.acquia.com/*' });
  if (existing.length) return { tabId: existing[0].id, opened: false };

  // Open in background, don't steal focus
  const tab = await chrome.tabs.create({ url: 'https://cloud.acquia.com/', active: false });
  const tabId = tab.id;

  // Wait for page to finish loading (max 15s)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      reject(new Error('cloud.acquia.com did not load in time'));
    }, 15000);
    function fn(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(fn);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(fn);
  });

  // If Okta redirected to login, the user isn't logged in
  const loaded = await chrome.tabs.get(tabId).catch(() => null);
  if (!loaded?.url?.startsWith('https://cloud.acquia.com/')) {
    chrome.tabs.remove(tabId).catch(() => {});
    return { tabId: null, opened: true, notLoggedIn: true };
  }

  // Give the Okta SDK time to populate storage (~3s is usually enough)
  await new Promise(r => setTimeout(r, 3000));

  return { tabId, opened: true };
}

/* ── Injected function: find token + call API ───────────────────────────── */
async function callAcquiaApi(endpoint) {
  // Deep-scan any Storage object for JWT strings (eyJ...)
  function extractJWTs(storage) {
    const found = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const val = storage.getItem(storage.key(i));
        if (!val) continue;
        if (val.startsWith('eyJ') && val.length > 100) { found.push(val); continue; }
        try {
          const walk = (o, depth) => {
            if (depth > 6 || o == null) return;
            if (typeof o === 'string' && o.startsWith('eyJ') && o.length > 100) found.push(o);
            else if (typeof o === 'object') Object.values(o).forEach(v => walk(v, depth + 1));
          };
          walk(JSON.parse(val), 0);
        } catch {}
      }
    } catch {}
    return found;
  }

  const tokens = [...new Set([
    ...extractJWTs(localStorage),
    ...extractJWTs(sessionStorage),
  ])].sort((a, b) => b.length - a.length); // longer = more likely access token

  const BASE = 'https://cloud.acquia.com/api';

  // Try each discovered token; fall back to cookie-only request
  const attempts = [
    ...tokens.map(t => ({ Accept: 'application/json', Authorization: `Bearer ${t}` })),
    { Accept: 'application/json' }, // cookies only
  ];

  for (const headers of attempts) {
    try {
      const r = await fetch(`${BASE}${endpoint}`, { headers, credentials: 'include' });
      if (r.ok) return { ok: true, status: r.status, body: await r.text() };
      if (r.status === 401 || r.status === 403) continue; // wrong token, try next
      return { ok: false, status: r.status, body: await r.text() };
    } catch { continue; }
  }

  return { ok: false, error: 'NO_TOKEN' };
}

/* ── Message handler ────────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACQUIA_API_CALL') {
    (async () => {
      try {
        const { tabId, opened, notLoggedIn } = await ensureAcquiaTab();

        if (notLoggedIn) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: callAcquiaApi,
          args: [msg.endpoint],
        });

        if (opened) chrome.tabs.remove(tabId).catch(() => {});

        sendResponse(results[0].result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});
