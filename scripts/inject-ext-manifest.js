const fs = require('fs');
const path = require('path');

const manifest = {
  manifest_version: 3,
  name: "Acquia DNS Finder",
  version: "2.0",
  description: "DNS Repointing Checker for Acquia hosted applications",
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmpYrZ6rmk7BI07BW8HCDNXb3BMSWcgYxm63uOvpL1YQXnDiA3otZjCvTLtqh0x9hdugiafx4JFBRcR1aN7q4cJU2PdA6sxip7eu3/yfUylulJvDRFKiihb5R6RrKezCjlX55/RPReukBjGcpyJ66hfX32+XEH/HOppUU+GkJQARw772SF1meNsoTJXPmEztrAfJLDy6ikggvUAjsf/K7EOfNDh6TI41YnZ/xZ7mbhHwir2diXZ51VWDlx4mncZK6MnN/Pm5gN/tBdd1/9dRVBIzIyGKMap9IXIYA7P0TGJbkANzRBFNaI1VNFP/crrzbs+bMfYC33jQAItPDtuwTcwIDAQAB",
  action: { default_title: "Acquia DNS Finder" },
  background: { service_worker: "background.js" },
  permissions: ["storage", "tabs", "scripting", "webRequest"],
  content_scripts: [
    {
      matches: ["https://cloud.acquia.com/*"],
      js: ["token-interceptor.js"],
      run_at: "document_start",
      world: "MAIN"
    },
    {
      matches: ["https://cloud.acquia.com/*"],
      js: ["token-relay.js"],
      run_at: "document_start"
    }
  ],
  host_permissions: [
    "https://cloud.acquia.com/*",
    "https://accounts.acquia.com/*",
    "https://id.acquia.com/*",
    "https://cloudflare-dns.com/*"
  ]
};

const dest = path.join(__dirname, '..', 'build', 'manifest.json');
fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
console.log('Chrome extension manifest written to build/manifest.json');
