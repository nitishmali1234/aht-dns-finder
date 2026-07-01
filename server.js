const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to run shell commands
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          error: error.message,
          stderr: stderr,
          stdout: stdout
        });
      } else {
        resolve({
          success: true,
          output: stdout,
          stderr: stderr
        });
      }
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Main endpoint to run AHT commands
app.post('/run-aht', async (req, res) => {
  const { appName } = req.body;

  if (!appName) {
    return res.status(400).json({ error: 'appName is required' });
  }

  try {
    const commands = [
      { name: 'a:i', cmd: `aht a:i ${appName}` },
      { name: 'server', cmd: `aht server ${appName}` },
      { name: 'dc', cmd: `aht dc ${appName}` },
      { name: 'do:li', cmd: `aht do:li ${appName}` }
    ];

    const results = {};

    for (const cmd of commands) {
      results[cmd.name] = await runCommand(cmd.cmd);
    }

    res.json({
      appName,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`AHT Backend running on http://localhost:${PORT}`);
  console.log('Extension can now call the backend to execute AHT commands');
});
