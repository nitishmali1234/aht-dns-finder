const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

// Check if running in development (has node_modules in parent, not packaged)
const isDev = fs.existsSync(path.join(__dirname, '../node_modules'));

// Start the Node backend server
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '../server.js');
    
    serverProcess = spawn('node', [serverPath], {
      stdio: 'inherit', // Show server logs in console
      shell: true
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    // Give server time to start
    setTimeout(resolve, 2000);
  });
}

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  console.log('Loading URL:', startUrl);
  console.log('isDev:', isDev);
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.on('ready', async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Kill server process
  if (serverProcess) {
    serverProcess.kill();
  }
  // Quit app on macOS and Windows
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Cleanup on exit
process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
