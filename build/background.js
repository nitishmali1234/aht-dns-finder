chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

// Real Okta endpoints discovered via accounts.acquia.com/.well-known/openid-configuration
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

  if (msg.type === 'ACQUIA_REFRESH') {
    post(TOKEN_URL, {
      grant_type:    'refresh_token',
      client_id:     msg.clientId,
      refresh_token: msg.refreshToken,
    }, sendResponse);
    return true;
  }
});
