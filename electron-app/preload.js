/**
 * preload.js — Electron preload script
 *
 * Runs in a privileged context (has access to Node APIs) but executes
 * before the web page loads. With contextIsolation: true in main.js,
 * this is the ONLY place Node/Electron APIs can be safely exposed to
 * the renderer (the web page).
 *
 * For now we don't need to expose anything extra — the frontend just
 * talks to the backend over HTTP exactly like a normal web app. This
 * file exists so contextIsolation: true is set correctly (a security
 * best practice for Electron apps) and as a ready extension point if
 * we later need to expose things like native file dialogs or OS-level
 * notifications to the UI.
 */

const { contextBridge } = require('electron');

// Nothing to expose yet — keeping this minimal and correct.
// If we later need native capabilities in the UI, we'd do:
//   contextBridge.exposeInMainWorld('electronAPI', { ... });
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform, // lets the UI know it's running in Electron vs a browser
});
