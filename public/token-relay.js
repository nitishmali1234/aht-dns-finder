// Runs in ISOLATED world on cloud.acquia.com.
// Listens for token messages from the MAIN world interceptor and forwards
// them to the background service worker via chrome.runtime.sendMessage.
window.addEventListener('message', (e) => {
  if (e.source === window && e.data?.__acquia_ext__ && e.data.token) {
    chrome.runtime.sendMessage({ type: 'ACQUIA_TOKEN_CAPTURED', token: e.data.token })
      .catch(() => {});
  }
});
