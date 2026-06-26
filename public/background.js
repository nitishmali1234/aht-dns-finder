chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Acquia Cloud API via session injection ────────────────────────────────
  // Injects into an open cloud.acquia.com tab, reads the Okta token from
  // localStorage, and calls cloud.acquia.com/api as the logged-in user.
  // No separate API credentials needed — uses the engineer's existing session.
  if (msg.type === 'ACQUIA_API_CALL') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: 'https://cloud.acquia.com/*' });
        if (!tabs.length) {
          sendResponse({ ok: false, error: 'NOT_LOGGED_IN' });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: async (endpoint) => {
            const BASE = 'https://cloud.acquia.com/api';

            // Extract Okta Bearer token from localStorage (tries common key patterns)
            let token = null;
            const keys = ['okta-token-storage',
              ...Object.keys(localStorage).filter(k => k.toLowerCase().includes('okta'))];
            for (const key of keys) {
              try {
                const d = JSON.parse(localStorage.getItem(key) || '{}');
                const t = d?.accessToken?.accessToken || d?.accessToken?.value;
                if (t && t.length > 20) { token = t; break; }
              } catch { /* skip malformed entries */ }
            }

            if (!token) return { ok: false, error: 'NO_TOKEN' };

            try {
              const r = await fetch(`${BASE}${endpoint}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
              });
              return { ok: r.ok, status: r.status, body: await r.text() };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          },
          args: [msg.endpoint],
        });

        sendResponse(results[0].result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

});
