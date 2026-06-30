const fs = require('fs');
const path = require('path');

const manifest = {
  manifest_version: 3,
  name: "Acquia DNS Finder",
  version: "2.0",
  description: "DNS Repointing Checker for Acquia hosted applications",
  action: {
    default_title: "Acquia DNS Finder"
  },
  background: {
    service_worker: "background.js"
  },
  permissions: [
    "downloads"
  ],
  host_permissions: [
    "http://localhost:8001/*"
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
  }
};

const dest = path.join(__dirname, '..', 'build', 'manifest.json');
fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
console.log('Chrome extension manifest written to build/manifest.json');
