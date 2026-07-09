const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const { parseApplicationInfo, parseDomainsList, parseDomainsCheck, parseServerInfo, parseDigOutput } = require('./parser');

const app = express();
const PORT = process.env.AHT_BACKEND_PORT || 4000;

// ============================================================
// AUTH / BASTION CONFIGURATION
// ============================================================
// If your aht binary requires specific environment variables
// (e.g., AHT_BASTION, SSH keys, VPN tunnel), set them here.
// They will be injected into the child_process environment.
//
// Example:
//   AHT_BASTION: 'bastion-22'
//   SSH_AUTH_SOCK: '/path/to/agent.sock'
//   AHT_PATH: '/usr/local/bin/aht'  (if not on default PATH)
//
// You can also set these as shell environment variables before
// starting the server, and they'll be inherited automatically.
// ============================================================
const AHT_ENV = {
  ...process.env,
  // AHT_BASTION: 'bastion-22',
  // Add any additional env vars needed for aht/bastion auth here
};

// Path to the aht binary. Change if it's not on your PATH.
const AHT_BINARY = process.env.AHT_PATH || 'aht';

// dig is a standard DNS tool, not part of aht — it ships with macOS/Linux
// by default, so this rarely needs changing.
const DIG_BINARY = process.env.DIG_PATH || 'dig';

// Timeout for aht commands in milliseconds (default 60s for bastion latency)
const AHT_TIMEOUT = parseInt(process.env.AHT_TIMEOUT || '3600000', 10); // 1 hour

/**
 * People often paste a full URL into the dig field (e.g. "https://example.com/page").
 * dig expects a bare hostname, so strip the protocol, any path/query string,
 * and a trailing dot before it's used in a shell command.
 */
function sanitizeHostnameForDig(input) {
  let h = String(input).trim();
  h = h.replace(/^https?:\/\//i, '');
  h = h.split('/')[0];
  h = h.split('?')[0];
  h = h.split('#')[0];
  h = h.replace(/\.$/, '');
  // Only allow characters valid in a hostname — defends against shell injection
  // via this field, since it's interpolated directly into a command string.
  if (!/^[a-zA-Z0-9.-]+$/.test(h)) return null;
  return h;
}

// Application/customer names, environment names, and server names are all
// interpolated directly into a shell command string below, so they're
// validated against the same conservative allow-list as the dig hostname
// (letters, numbers, dots, hyphens, underscores). This both blocks shell
// injection via these fields and gives a clear, specific error message
// instead of a confusing aht/shell failure when someone mistypes or pastes
// something that was never a valid customer/application name to begin with.
const IDENTIFIER_REGEX = /^[a-zA-Z0-9._-]+$/;

function validateIdentifier(value, fieldLabel) {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return `Missing ${fieldLabel}.`;
  }
  if (!IDENTIFIER_REGEX.test(trimmed)) {
    return `Invalid ${fieldLabel}: "${trimmed}". Only letters, numbers, dots, hyphens, and underscores are allowed.`;
  }
  return null;
}

// Recognizes the various ways aht/the Cloud API phrase "that application or
// environment doesn't exist" so we can surface a clear, specific message
// instead of the raw shell/exec failure — this is by far the most common
// mistake users make (typo'd or non-existent customer/application name).
const NOT_FOUND_REGEX = /(no such (application|site|environment)|application not found|site not found|could not find|couldn't find|does not exist|no matching (application|site|environment)|unknown (application|site|environment)|invalid (application|site|environment))/i;

// Matches ANSI/SGR escape codes like "\x1b[32;1m" or "\x1b[39m" — aht emits
// these for terminal coloring, which show up as literal garbage once piped
// through a non-TTY exec() call instead of a real terminal. Stripping them
// also matters for parsing correctness: the literal "[" inside an escape
// code can otherwise get matched by the bracket regex in parseApplicationInfo,
// corrupting the extracted fields.
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;

// Matches the recurring "*** WARNING *** ... ***" banner aht prints once
// per environment on Acquia Cloud Next sites. It's not actionable and
// just repeats, so it's dropped entirely rather than surfaced.
const STANDALONE_WARNING_BANNER_REGEX = /^\*\*\*\s*WARNING\s*\*\*\*.*\*\*\*\s*$/;

function cleanAhtOutput(text) {
  if (!text) return text;
  let cleaned = text.replace(ANSI_REGEX, '');
  cleaned = cleaned
    .split('\n')
    .filter(line => !STANDALONE_WARNING_BANNER_REGEX.test(line.trim()))
    .join('\n');
  // Trim trailing whitespace left over per line after stripping ANSI suffixes
  cleaned = cleaned.replace(/[ \t]+$/gm, '');
  // Collapse 3+ consecutive blank lines (left behind by the removed banner)
  // down to a single blank line
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned;
}

app.use(cors());
app.use(express.json());

app.post('/api/aht', (req, res) => {
  const { app: appName, env, command, serverName, hostname } = req.body;

  const validCommands = ['application:info', 'domains:list', 'domains:check', 'server', 'dig'];
  const cmd = command || 'application:info';

  if (!validCommands.includes(cmd)) {
    return res.status(400).json({
      error: `Invalid command: ${cmd}. Supported commands: ${validCommands.join(', ')}`,
      raw: null,
      parsed: null
    });
  }

  let fullCommand;

  if (cmd === 'server') {
    // Server lookup takes a bare hostname (e.g. "bal-12345") with no
    // @app.env target — it's a different shape of command entirely.
    const serverNameError = validateIdentifier(serverName, 'server name');
    if (serverNameError) {
      return res.status(400).json({ error: serverNameError, raw: null, parsed: null });
    }
    fullCommand = `${AHT_BINARY} server ${serverName.trim()}`;
  } else if (cmd === 'dig') {
    // dig isn't part of aht at all — it's a standalone DNS lookup tool.
    // People often paste a full URL here, so strip the protocol and any
    // path/query before it ever reaches the shell.
    if (!hostname) {
      return res.status(400).json({
        error: 'Missing required field: hostname',
        raw: null,
        parsed: null
      });
    }
    const sanitized = sanitizeHostnameForDig(hostname);
    if (!sanitized) {
      return res.status(400).json({
        error: 'Could not extract a valid hostname from the input provided',
        raw: null,
        parsed: null
      });
    }
    fullCommand = `${DIG_BINARY} ${sanitized}`;
  } else {
    const appNameError = validateIdentifier(appName, 'application/customer name');
    if (appNameError) {
      return res.status(400).json({ error: appNameError, raw: null, parsed: null });
    }

    const envRequiredCommands = ['domains:list', 'domains:check'];
    if (envRequiredCommands.includes(cmd) && !env) {
      return res.status(400).json({
        error: `Environment is required for ${cmd} command`,
        raw: null,
        parsed: null
      });
    }

    if (env) {
      const envError = validateIdentifier(env, 'environment name');
      if (envError) {
        return res.status(400).json({ error: envError, raw: null, parsed: null });
      }
    }

    // Build the aht command string
    const trimmedAppName = appName.trim();
    const target = env ? `@${trimmedAppName}.${env.trim()}` : `@${trimmedAppName}`;
    fullCommand = `${AHT_BINARY} ${target} ${cmd}`;
  }

  console.log(`[${new Date().toISOString()}] Executing: ${fullCommand}`);

  exec(fullCommand, {
    env: AHT_ENV,
    timeout: AHT_TIMEOUT,
    maxBuffer: 1024 * 1024 * 5 // 5MB buffer for large domain lists
  }, (error, stdout, stderr) => {
    const timestamp = new Date().toISOString();

    if (error) {
      console.error(`[${timestamp}] Command failed:`, error.message);

      // Distinguish between different failure modes
      const combinedOutput = `${stdout || ''}\n${stderr || ''}`;
      let errorMessage;
      if (cmd !== 'dig' && NOT_FOUND_REGEX.test(combinedOutput)) {
        const target = cmd === 'server' ? serverName : appName;
        errorMessage = `No customer or application found matching "${target}". Please check the name and try again.`;
      } else if (error.killed) {
        errorMessage = `Command timed out after ${AHT_TIMEOUT}ms. Check bastion connectivity.`;
      } else if (error.code === 127) {
        errorMessage = cmd === 'dig'
          ? `"${DIG_BINARY}" binary not found. Make sure dig is installed (it ships with macOS/Linux by default; on some systems it's part of a "dnsutils" or "bind-utils" package).`
          : `aht binary not found at "${AHT_BINARY}". Ensure aht is installed and AHT_PATH is set correctly.`;
      } else if (error.message.includes('ENOENT')) {
        errorMessage = `Binary not found. Set the appropriate PATH environment variable or ensure the binary is installed.`;
      } else {
        errorMessage = error.message;
      }

      return res.status(500).json({
        error: errorMessage,
        raw: cleanAhtOutput(stdout) || cleanAhtOutput(stderr) || null,
        parsed: null,
        command: fullCommand,
        timestamp
      });
    }

    const raw = cleanAhtOutput(stdout);
    let parsed = null;
    let warnings = [];

    // Extract warnings from output
    const warningRegex = /^WARNING:.*$/gm;
    let match;
    while ((match = warningRegex.exec(raw)) !== null) {
      warnings.push(match[0]);
    }

    // Parse based on command type
    try {
      if (cmd === 'application:info') {
        parsed = parseApplicationInfo(raw);
      } else if (cmd === 'domains:list') {
        parsed = parseDomainsList(raw);
      } else if (cmd === 'domains:check') {
        parsed = parseDomainsCheck(raw);
      } else if (cmd === 'server') {
        parsed = parseServerInfo(raw);
      } else if (cmd === 'dig') {
        parsed = parseDigOutput(raw);
      }
    } catch (parseError) {
      console.error(`[${timestamp}] Parse error:`, parseError.message);
      // Still return raw even if parsing fails
    }

    res.json({
      raw,
      parsed,
      warnings,
      command: fullCommand,
      timestamp
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Temporary debug endpoint — open http://localhost:4000/api/debug
// in your browser while the app is running to see what PATH the app sees.
app.get('/api/debug', (req, res) => {
  const { execSync } = require('child_process');
  let ahtLocation = 'not found';
  try { ahtLocation = execSync('which aht', { encoding: 'utf8' }).trim(); } catch (e) {}
  let digLocation = 'not found';
  try { digLocation = execSync('which dig', { encoding: 'utf8' }).trim(); } catch (e) {}
  res.json({
    PATH: process.env.PATH,
    AHT_BINARY: AHT_BINARY,
    ahtWhich: ahtLocation,
    digWhich: digLocation,
    HOME: process.env.HOME,
  });
});

// Serve the frontend as static files — plain HTML/CSS/JS, no build step.
// In the Electron app, main.js sets FRONTEND_BUILD_PATH to the correct
// location inside the packaged .app bundle. In dev, fall back to the
// standard frontend/public folder one level up.
const FRONTEND_BUILD = process.env.FRONTEND_BUILD_PATH
  || path.join(__dirname, '..', 'frontend', 'public');

if (require('fs').existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`AHT Query Backend running on http://localhost:${PORT}`);
  console.log(`AHT binary: ${AHT_BINARY}`);
  console.log(`Timeout: ${AHT_TIMEOUT}ms`);
});
