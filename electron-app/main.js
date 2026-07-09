/**
 * main.js — Electron main process
 *
 * This is the "host" for the whole app. It does three things:
 *   1. Loads the Express backend (server.js) directly via require() —
 *      no child process needed since Electron already runs Node.js.
 *   2. Opens a BrowserWindow showing the React frontend (served by
 *      that same backend on localhost:4000).
 *   3. The backend shuts down automatically when the process exits.
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');

// ------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------

const IS_PACKAGED = app.isPackaged;

// When packaged, electron-builder copies backend/ into Resources/.
// When running via `npm start` (dev), it's one level up from electron-app/.
const BACKEND_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, 'backend')
  : path.join(__dirname, '..', 'backend');

const FRONTEND_BUILD = IS_PACKAGED
  ? path.join(process.resourcesPath, 'frontend', 'public')
  : path.join(__dirname, '..', 'frontend', 'public');

const BACKEND_PORT = 4000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// ------------------------------------------------------------------
// Backend — loaded directly into this process via require()
// No spawning, no separate Node binary needed.
// ------------------------------------------------------------------

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      console.log('[main] Loading backend from:', BACKEND_DIR);

      const { execSync } = require('child_process');
      const userShell = process.env.SHELL || '/bin/zsh';

      // Get full shell PATH
      try {
        const shellPath = execSync(
          `${userShell} -l -c 'echo $PATH'`,
          { timeout: 5000, encoding: 'utf8' }
        ).trim();
        const extraPaths = [
          `${process.env.HOME}/Support-Tools/bin`,
          `${process.env.HOME}/.acquia/bin`,
          `${process.env.HOME}/bin`,
        ].join(':');
        process.env.PATH = `${shellPath}:${extraPaths}`;
      } catch (e) {
        console.warn('[main] Could not read shell PATH:', e.message);
      }

      // Find aht and set AHT_PATH explicitly so server.js uses the full path
      try {
        const ahtPath = execSync('which aht', { encoding: 'utf8' }).trim();
        if (ahtPath) {
          process.env.AHT_PATH = ahtPath;
          console.log('[main] Found aht at:', ahtPath);
        }
      } catch (e) {
        console.warn('[main] aht not found on PATH');
      }

      if (!process.env.SSH_AUTH_SOCK) {
        try {
          const sock = execSync(
            `${userShell} -i -c 'echo $SSH_AUTH_SOCK' 2>/dev/null`,
            { timeout: 5000, encoding: 'utf8' }
          ).trim();
          if (sock) {
            process.env.SSH_AUTH_SOCK = sock;
            console.log('[main] SSH_AUTH_SOCK:', sock);
          }
        } catch (e) {
          console.warn('[main] Could not resolve SSH_AUTH_SOCK:', e.message);
        }
      }

      // GUI launches don't inherit .zshrc, so AHT_BASTION / AHT_BASTION_USER
      // pins set there (e.g. to pick a bastion the user actually has access
      // to) are lost unless re-read from an interactive shell explicitly.
      if (!process.env.AHT_BASTION) {
        try {
          const bastion = execSync(
            `${userShell} -i -c 'echo $AHT_BASTION' 2>/dev/null`,
            { timeout: 5000, encoding: 'utf8' }
          ).trim();
          if (bastion) {
            process.env.AHT_BASTION = bastion;
            console.log('[main] AHT_BASTION:', bastion);
          }
        } catch (e) {
          console.warn('[main] Could not resolve AHT_BASTION:', e.message);
        }
      }

      if (!process.env.AHT_BASTION_USER) {
        try {
          const bastionUser = execSync(
            `${userShell} -i -c 'echo $AHT_BASTION_USER' 2>/dev/null`,
            { timeout: 5000, encoding: 'utf8' }
          ).trim();
          if (bastionUser) {
            process.env.AHT_BASTION_USER = bastionUser;
            console.log('[main] AHT_BASTION_USER:', bastionUser);
          }
        } catch (e) {
          console.warn('[main] Could not resolve AHT_BASTION_USER:', e.message);
        }
      }

      // Last-resort fallback: derive from the local macOS username, stripping
      // dots/non-alphanumerics the same way the aht wrapper's own fallback
      // does (Teleport logins don't allow them — "nitish.mali" is invalid,
      // "nitishmali" is the real login).
      if (!process.env.AHT_BASTION_USER) {
        process.env.AHT_BASTION_USER = (process.env.USER || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      }

      process.env.AHT_BACKEND_PORT = BACKEND_PORT;
      process.env.FRONTEND_BUILD_PATH = FRONTEND_BUILD;

      require(path.join(BACKEND_DIR, 'server.js'));
      waitForBackend(BACKEND_URL + '/api/health', 30, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Polls the backend health endpoint until it responds.
 */
function waitForBackend(url, maxTries, resolve, reject) {
  let tries = 0;

  function attempt() {
    http.get(url, (res) => {
      console.log('[main] Backend ready (HTTP', res.statusCode, ')');
      resolve();
    }).on('error', () => {
      tries++;
      if (tries >= maxTries) {
        reject(new Error(`Backend did not respond after ${maxTries} attempts on ${url}`));
      } else {
        setTimeout(attempt, 500);
      }
    });
  }

  attempt();
}

// ------------------------------------------------------------------
// Window
// ------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AHT Query Tool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(BACKEND_URL);

  // Open external links in the system browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ------------------------------------------------------------------
// App lifecycle
// ------------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'AHT Query Tool — startup error',
      `The backend failed to start:\n\n${err.message}\n\n` +
      'Make sure aht is installed and you are logged in, then relaunch the app.'
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
