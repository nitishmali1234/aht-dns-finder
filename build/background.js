chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

// Proxy auth requests so they originate from the service worker context
// (Origin: chrome-extension://) instead of the extension page context.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACQUIA_AUTH') {
    fetch('https://accounts.acquia.com/api/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     msg.clientId,
        client_secret: msg.clientSecret,
      }).toString(),
    })
      .then(async r => sendResponse({ ok: r.ok, status: r.status, body: await r.text() }))
      .catch(e  => sendResponse({ ok: false, status: 0, body: e.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'ACQUIA_REFRESH') {
    fetch('https://accounts.acquia.com/api/auth/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     msg.clientId,
        refresh_token: msg.refreshToken,
      }).toString(),
    })
      .then(async r => sendResponse({ ok: r.ok, status: r.status, body: await r.text() }))
      .catch(e  => sendResponse({ ok: false, status: 0, body: e.message }));
    return true;
  }

  if (msg.type === 'ACQUIA_DISCOVER') {
    fetch('https://accounts.acquia.com/.well-known/openid-configuration')
      .then(async r => sendResponse({ ok: r.ok, body: await r.text() }))
      .catch(e  => sendResponse({ ok: false, body: e.message }));
    return true;
  }
});
