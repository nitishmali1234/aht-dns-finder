/* ── Passively capture the Bearer token from cloud.acquia.com API traffic ──
   The Acquia Cloud UI stores its Okta token in memory (not localStorage),
   so we intercept outgoing API requests to read it from the Authorization
   header instead.                                                           */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const auth = details.requestHeaders?.find(
      h => h.name.toLowerCase() === 'authorization'
    );
    if (auth?.value?.startsWith('Bearer ')) {
      chrome.storage.session.set({
        acquiaToken:   auth.value.slice(7),
        acquiaTokenAt: Date.now(),
      });
    }
  },
  { urls: ['https://cloud.acquia.com/api/*'] },
  ['requestHeaders', 'extraHeaders']
);

/* ── Extension icon → open UI in a new tab ──────────────────────────────── */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

/* ── Return cached token if it's less than 25 minutes old ──────────────── */
async function getCachedToken() {
  const { acquiaToken, acquiaTokenAt } = await chrome.storage.session.get([
    'acquiaToken', 'acquiaTokenAt',
  ]);
  if (acquiaToken && Date.now() - (acquiaTokenAt || 0) < 25 * 60 * 1000) {
    return acquiaToken;
  }
  return null;
}

/* ── Open cloud.acquia.com silently and wait for webRequest to capture a
   fresh token from the page's own API calls on load.                       */
async function acquireTokenViaBackgroundTab() {
  const tab = await chrome.tabs.create({ url: 'https://cloud.acquia.com/', active: false });
  const tabId = tab.id;
  try {
    // Wait for page to finish loading (max 15s)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdate);
        reject(new Error('cloud.acquia.com load timeout'));
      }, 15000);
      function onUpdate(id, info) {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(onUpdate);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
    });

    // If Okta redirected to the login page, the user isn't signed in
    const loaded = await chrome.tabs.get(tabId).catch(() => null);
    if (!loaded?.url?.startsWith('https://cloud.acquia.com/')) return null;

    // Poll for up to 8s — the page will make API calls and webRequest will
    // intercept the Authorization header automatically
    const start = Date.now();
    while (Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 400));
      const { acquiaToken, acquiaTokenAt } = await chrome.storage.session.get([
        'acquiaToken', 'acquiaTokenAt',
      ]);
      if (acquiaToken && acquiaTokenAt > start) return acquiaToken;
    }
    return null;
  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
  }
}

/* ── Message handler ────────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'ACQUIA_API_CALL') return;

  (async () => {
    try {
      // Use a cached token if available; otherwise open a background tab to get one
      const token = (await getCachedToken()) ?? (await acquireTokenViaBackgroundTab());

      if (!token) {
        sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
        return;
      }

      // Call the Acquia API directly from the service worker.
      // host_permissions bypass CORS — no tab injection required.
      const r = await fetch(`https://cloud.acquia.com/api${msg.endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      // Evict a rejected token so the next call re-acquires a fresh one
      if (r.status === 401 || r.status === 403) {
        await chrome.storage.session.remove(['acquiaToken', 'acquiaTokenAt']);
      }

      sendResponse({ ok: r.ok, status: r.status, body: await r.text() });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // keep message channel open for async sendResponse
});
