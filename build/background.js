/* ── Token capture: content scripts relay Bearer tokens here ────────────── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ACQUIA_TOKEN_CAPTURED' && msg.token) {
    chrome.storage.local.set({ acquiaToken: msg.token, acquiaTokenAt: Date.now() });
  }
});

/* ── Also capture via webRequest as a secondary path ────────────────────── */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const auth = details.requestHeaders?.find(
      h => h.name.toLowerCase() === 'authorization'
    );
    if (auth?.value?.startsWith('Bearer ')) {
      chrome.storage.local.set({
        acquiaToken: auth.value.slice(7),
        acquiaTokenAt: Date.now(),
      });
    }
  },
  { urls: ['https://cloud.acquia.com/*', 'https://*.acquia.com/*'] },
  ['requestHeaders', 'extraHeaders']
);

/* ── Extension icon → open UI in a new tab ──────────────────────────────── */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

/* ── Return cached token if < 25 min old ────────────────────────────────── */
async function getCachedToken() {
  const { acquiaToken, acquiaTokenAt } = await chrome.storage.local.get([
    'acquiaToken', 'acquiaTokenAt',
  ]);
  if (acquiaToken && Date.now() - (acquiaTokenAt || 0) < 25 * 60 * 1000) {
    return acquiaToken;
  }
  return null;
}

/* ── Programmatically inject the MAIN-world interceptor into an existing
   tab so we capture the very next API call the page makes.               ── */
async function injectInterceptorAndWait(tabId) {
  // Inject the fetch/XHR interceptor into the page's JS context
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['token-interceptor.js'],
    world: 'MAIN',
  }).catch(() => {});

  // Inject the relay script into the isolated world (gives it chrome API access)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['token-relay.js'],
    world: 'ISOLATED',
  }).catch(() => {});

  // Now trigger a lightweight API call from within the tab so the interceptor
  // captures the token immediately rather than waiting for user interaction
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      fetch('https://cloud.acquia.com/api/account', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }).catch(() => {});
    },
    world: 'MAIN',
  }).catch(() => {});

  // Poll up to 5s for the relayed token to appear in storage
  const start = Date.now();
  while (Date.now() - start < 5000) {
    await new Promise(r => setTimeout(r, 300));
    const { acquiaToken, acquiaTokenAt } = await chrome.storage.local.get([
      'acquiaToken', 'acquiaTokenAt',
    ]);
    if (acquiaToken && acquiaTokenAt > start - 500) return acquiaToken;
  }
  return null;
}

/* ── Open cloud.acquia.com, wait for content scripts to capture token ───── */
async function acquireTokenViaNewTab() {
  const tab = await chrome.tabs.create({ url: 'https://cloud.acquia.com/', active: true });
  const tabId = tab.id;

  try {
    // Wait for the page to fully load (content scripts fire automatically)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdate);
        reject(new Error('Timeout'));
      }, 20000);
      function onUpdate(id, info) {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(onUpdate);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
    });

    // The content scripts have fired; now poll for the token (up to 12s)
    const start = Date.now();
    while (Date.now() - start < 12000) {
      await new Promise(r => setTimeout(r, 400));
      const { acquiaToken, acquiaTokenAt } = await chrome.storage.local.get([
        'acquiaToken', 'acquiaTokenAt',
      ]);
      if (acquiaToken && acquiaTokenAt > start - 500) return acquiaToken;
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
      // 1. Use cached token if fresh
      let token = await getCachedToken();

      if (!token) {
        // 2. Try injecting into an already-open cloud.acquia.com tab
        const tabs = await chrome.tabs.query({ url: 'https://cloud.acquia.com/*' });
        if (tabs.length) {
          token = await injectInterceptorAndWait(tabs[0].id);
        }
      }

      if (!token) {
        // 3. Open cloud.acquia.com and wait for the content scripts to capture a token
        token = await acquireTokenViaNewTab();
      }

      if (!token) {
        sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
        return;
      }

      // Call the Acquia API directly from the service worker (host_permissions bypass CORS)
      const r = await fetch(`https://cloud.acquia.com/api${msg.endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (r.status === 401 || r.status === 403) {
        await chrome.storage.local.remove(['acquiaToken', 'acquiaTokenAt']);
      }

      sendResponse({ ok: r.ok, status: r.status, body: await r.text() });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true;
});
