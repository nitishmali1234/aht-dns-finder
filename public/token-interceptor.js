// Runs in MAIN world on cloud.acquia.com — same JS context as Okta SDK.
// Patches window.fetch to capture Bearer tokens from outgoing API calls
// and relays them to the ISOLATED world via postMessage.
(() => {
  const send = (token) =>
    window.postMessage({ __acquia_ext__: true, token }, '*');

  const origFetch = window.fetch;
  window.fetch = function (input, init, ...rest) {
    const auth =
      (init?.headers instanceof Headers
        ? init.headers.get('authorization')
        : init?.headers?.Authorization || init?.headers?.authorization) || '';
    if (auth.toLowerCase().startsWith('bearer ')) send(auth.slice(7));
    return origFetch.call(this, input, init, ...rest);
  };

  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name.toLowerCase() === 'authorization' &&
        typeof value === 'string' &&
        value.toLowerCase().startsWith('bearer ')) {
      send(value.slice(7));
    }
    return origSetHeader.apply(this, arguments);
  };
})();
