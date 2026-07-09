/**
 * AHT Query Interface — plain JS frontend (no build step).
 *
 * Talks to the backend at the same origin it's served from (the Express
 * server this file is served by also handles POST /api/aht), so fetch()
 * calls use relative paths.
 */

// Mirrors the backend's identifier allow-list (backend/server.js
// IDENTIFIER_REGEX) so obviously-invalid input is caught instantly in the
// UI instead of round-tripping to the server first.
const IDENTIFIER_REGEX = /^[a-zA-Z0-9._-]+$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------------
// Field elements + inline validation
// ------------------------------------------------------------------

const appNameInput = document.getElementById('app-name');
const envNameInput = document.getElementById('env-name');
const serverNameInput = document.getElementById('server-name');
const digHostnameInput = document.getElementById('dig-hostname');

const appNameError = document.getElementById('app-name-error');
const envNameError = document.getElementById('env-name-error');
const serverNameError = document.getElementById('server-name-error');

function setFieldError(inputEl, errorEl, message) {
  if (message) {
    inputEl.classList.add('input-field-invalid');
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  } else {
    inputEl.classList.remove('input-field-invalid');
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
}

function clearFieldErrors() {
  setFieldError(appNameInput, appNameError, null);
  setFieldError(envNameInput, envNameError, null);
  setFieldError(serverNameInput, serverNameError, null);
}

/**
 * Validates a customer/application, environment, or server identifier.
 * Returns an error message string, or null if valid.
 */
function validateIdentifier(value, fieldLabel) {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${fieldLabel} is required.`;
  }
  if (!IDENTIFIER_REGEX.test(trimmed)) {
    return `Invalid ${fieldLabel.toLowerCase()}: "${trimmed}". Only letters, numbers, dots, hyphens, and underscores are allowed.`;
  }
  return null;
}

// ------------------------------------------------------------------
// Querying the backend
// ------------------------------------------------------------------

async function queryAht(appName, env, command, serverName, hostname) {
  let response;
  try {
    response = await fetch('/api/aht', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: appName, env, command, serverName, hostname }),
    });
  } catch (networkError) {
    throw new Error(
      `Network error: unable to reach the backend. Is the server running? (${networkError.message})`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Unexpected response from server (status ${response.status}): ${text.slice(0, 200) || 'non-JSON body'}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error(
      `Failed to parse server response as JSON (status ${response.status}): ${parseError.message}`
    );
  }

  if (!response.ok && !data.error) {
    data.error = data.message || `Server returned status ${response.status}`;
  }

  return data;
}

let loading = false;

async function runQuery(appName, env, command, serverName, hostname) {
  loading = true;
  renderLoading();

  try {
    const data = await queryAht(appName, env, command, serverName, hostname);
    renderResults(data, data.error || null);
  } catch (err) {
    renderResults(null, err.message || 'An unexpected error occurred');
  } finally {
    loading = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('.query-panel-actions .btn').forEach((btn) => {
    btn.disabled = disabled;
  });
  if (disabled) {
    btnGetEnv.textContent = 'LOADING...';
    btnGetServer.textContent = 'LOADING...';
    btnRunDig.textContent = 'LOADING...';
  } else {
    btnGetEnv.textContent = 'GET ENVIRONMENTS';
    btnGetServer.textContent = 'GET SERVER INFO';
    btnRunDig.textContent = 'RUN DIG';
  }
}

// ------------------------------------------------------------------
// Button handlers
// ------------------------------------------------------------------

const btnGetEnv = document.getElementById('btn-get-env');
const btnGetDomains = document.getElementById('btn-get-domains');
const btnCheckDomains = document.getElementById('btn-check-domains');
const btnClear = document.getElementById('btn-clear');
const btnGetServer = document.getElementById('btn-get-server');
const btnRunDig = document.getElementById('btn-run-dig');

function handleGetEnvironments() {
  const appName = appNameInput.value.trim();
  const error = validateIdentifier(appName, 'Application/customer name');
  setFieldError(appNameInput, appNameError, error);
  if (error) return;

  const env = envNameInput.value.trim();
  if (env) {
    const envError = validateIdentifier(env, 'Environment name');
    setFieldError(envNameInput, envNameError, envError);
    if (envError) return;
  }

  if (loading) return;
  setButtonsDisabled(true);
  runQuery(appName, env || null, 'application:info');
}

function handleGetDomains() {
  const appName = appNameInput.value.trim();
  const error = validateIdentifier(appName, 'Application/customer name');
  setFieldError(appNameInput, appNameError, error);
  if (error) return;

  const env = envNameInput.value.trim();
  const envError = validateIdentifier(env, 'Environment name');
  setFieldError(envNameInput, envNameError, envError);
  if (envError) return;

  if (loading) return;
  setButtonsDisabled(true);
  runQuery(appName, env, 'domains:list');
}

function handleCheckDomains() {
  const appName = appNameInput.value.trim();
  const error = validateIdentifier(appName, 'Application/customer name');
  setFieldError(appNameInput, appNameError, error);
  if (error) return;

  const env = envNameInput.value.trim();
  const envError = validateIdentifier(env, 'Environment name');
  setFieldError(envNameInput, envNameError, envError);
  if (envError) return;

  if (loading) return;
  setButtonsDisabled(true);
  runQuery(appName, env, 'domains:check');
}

function handleGetServerInfo() {
  const serverName = serverNameInput.value.trim();
  const error = validateIdentifier(serverName, 'Server name');
  setFieldError(serverNameInput, serverNameError, error);
  if (error) return;

  if (loading) return;
  setButtonsDisabled(true);
  runQuery(null, null, 'server', serverName);
}

function handleRunDig() {
  const hostname = digHostnameInput.value.trim();
  if (!hostname) return;

  if (loading) return;
  setButtonsDisabled(true);
  runQuery(null, null, 'dig', null, hostname);
}

function handleClear() {
  appNameInput.value = '';
  envNameInput.value = '';
  serverNameInput.value = '';
  digHostnameInput.value = '';
  clearFieldErrors();
  renderEmpty();
}

btnGetEnv.addEventListener('click', handleGetEnvironments);
btnGetDomains.addEventListener('click', handleGetDomains);
btnCheckDomains.addEventListener('click', handleCheckDomains);
btnClear.addEventListener('click', handleClear);
btnGetServer.addEventListener('click', handleGetServerInfo);
btnRunDig.addEventListener('click', handleRunDig);

appNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleGetEnvironments();
});
envNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleGetEnvironments();
});
serverNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleGetServerInfo();
});
digHostnameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleRunDig();
});

// ------------------------------------------------------------------
// Rendering — results panel
// ------------------------------------------------------------------

const resultsPanel = document.getElementById('results-panel');

function renderLoading() {
  resultsPanel.innerHTML = `
    <div class="results-loading">
      <div class="spinner"></div>
      <span>Executing AHT command...</span>
    </div>
  `;
}

function renderEmpty() {
  resultsPanel.innerHTML = `
    <div class="results-empty">
      <span class="empty-icon">⌘</span>
      <p>Run a query to see results here.</p>
    </div>
  `;
}

function renderResults(results, error) {
  if (error && !results) {
    resultsPanel.innerHTML = `
      <div class="results-error">
        <span class="error-icon">✕</span>
        <div class="error-content">
          <strong>Command Failed</strong>
          <p>${escapeHtml(error)}</p>
        </div>
      </div>
    `;
    return;
  }

  if (!results) {
    renderEmpty();
    return;
  }

  const { raw, parsed, warnings, command, timestamp } = results;
  const hasDomains = parsed && parsed.domains;
  const hasEnvironments = parsed && parsed.environments && parsed.environments.length > 0;
  const hasEntitlements = parsed && parsed.entitlements && parsed.entitlements.length > 0;
  const hasChecks = parsed && parsed.checks && parsed.checks.length > 0;
  const hasServerInfo = parsed && parsed.info && Object.keys(parsed.info).length > 0;
  const hasDigResult = parsed && parsed.question;

  let html = '';

  html += `
    <div class="results-meta">
      <div class="meta-row">
        <span class="meta-label">Timestamp:</span>
        <span class="meta-value">${escapeHtml(timestamp)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Command:</span>
        <code class="meta-command">${escapeHtml(command)}</code>
      </div>
    </div>
  `;

  if (error) {
    html += `
      <div class="results-error results-error-inline">
        <span class="error-icon">✕</span>
        <p>${escapeHtml(error)}</p>
      </div>
    `;
  }

  if (warnings && warnings.length > 0) {
    html += `<div class="results-warnings">`;
    warnings.forEach((w) => {
      html += `
        <div class="warning-line">
          <span class="warning-icon">⚠</span>
          <span>${escapeHtml(w)}</span>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (hasEnvironments) {
    parsed.environments.forEach((envBlock, idx) => {
      const info = envBlock.info || {};
      const label = info.displayName || info.environment || `Environment ${idx + 1}`;

      html += `<div class="results-section environment-card">`;
      html += `
        <h3 class="section-title">
          ${escapeHtml(label)}
          ${info.sitename ? `<span class="env-sitename"> — ${escapeHtml(info.sitename)}</span>` : ''}
        </h3>
        <details class="collapsible-block">
          <summary class="collapsible-summary">Environment Details</summary>
          <div class="app-info-grid">
            ${info.environment ? infoItem('Environment', info.environment) : ''}
            ${info.sitename ? infoItem('Sitename', info.sitename) : ''}
            ${info.displayName ? infoItem('Display Name', info.displayName) : ''}
            ${info.revision ? infoItem('Revision', info.revision, true) : ''}
            ${info.php ? infoItem('PHP', info.php) : ''}
            ${info.applicationType ? infoItem('Application Type', info.applicationType) : ''}
            ${info.provider ? infoItem('Provider', info.provider) : ''}
            ${info.tags && info.tags.length > 0 ? infoItem('Tags', info.tags.join(', ')) : ''}
          </div>
        </details>
      `;

      if (envBlock.hosts && envBlock.hosts.length > 0) {
        html += `
          <div class="environment-hosts">
            <h4 class="subsection-title">Hosts</h4>
            ${renderHostsTable(envBlock.hosts)}
            ${envBlock.footnotes && envBlock.footnotes.length > 0
              ? `<div class="footnotes">${envBlock.footnotes.map((fn) => `<div class="footnote-line">${escapeHtml(fn)}</div>`).join('')}</div>`
              : ''}
          </div>
        `;
      }

      html += `</div>`;
    });
  }

  if (hasEntitlements) {
    html += `
      <div class="results-section">
        <details class="collapsible-block">
          <summary class="collapsible-summary section-title-summary">Entitlements</summary>
          ${renderEntitlementsTable(parsed.entitlements)}
        </details>
      </div>
    `;
  }

  if (hasDomains && parsed.domains.length > 0) {
    html += `
      <div class="results-section">
        <h3 class="section-title">Domains (${parsed.domains.length})</h3>
        <div class="domains-list">
          ${parsed.domains.map((d) => `
            <div class="domain-row">
              <span class="domain-name">${escapeHtml(d.name)}</span>
              ${d.type ? `<span class="domain-tag">${escapeHtml(d.type)}</span>` : ''}
              ${d.status ? `<span class="domain-tag">${escapeHtml(d.status)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (hasChecks) {
    html += `
      <div class="results-section">
        <h3 class="section-title">Domain Check (${parsed.checks.length})</h3>
        ${renderDomainCheckTable(parsed.summary, parsed.checks)}
      </div>
    `;
  }

  if (hasServerInfo) {
    html += `
      <div class="results-section">
        <h3 class="section-title">Server Info</h3>
        ${renderServerInfoCard(parsed.info, parsed.configRaw)}
      </div>
    `;
  }

  if (hasDigResult) {
    html += `
      <div class="results-section">
        <h3 class="section-title">DNS Lookup</h3>
        ${renderDigResultCard(parsed)}
      </div>
    `;
  }

  if (raw) {
    html += `
      <div class="results-section">
        <details class="collapsible-block">
          <summary class="collapsible-summary section-title-summary">Raw Output</summary>
          <pre class="raw-output">${escapeHtml(raw)}</pre>
        </details>
      </div>
    `;
  }

  resultsPanel.innerHTML = html;

  const eipCopyBtn = resultsPanel.querySelector('.eip-copy-btn');
  if (eipCopyBtn) {
    eipCopyBtn.addEventListener('click', () => {
      const eip = eipCopyBtn.dataset.eip;
      if (!eip) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(eip).then(() => {
          eipCopyBtn.textContent = 'Copied!';
          setTimeout(() => { eipCopyBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {});
      }
    });
  }
}

function infoItem(label, value, mono) {
  return `
    <div class="info-item">
      <span class="info-label">${escapeHtml(label)}</span>
      <span class="info-value${mono ? ' mono' : ''}">${escapeHtml(value)}</span>
    </div>
  `;
}

// ------------------------------------------------------------------
// Rendering — sub-tables/cards
// ------------------------------------------------------------------

function getFlagBadgesHtml(flags) {
  if (!flags || flags.length === 0) return '';
  return flags.map((flag) => {
    let label = flag;
    let className = 'flag-badge';
    if (flag === 'not_in_rotation') {
      label = '✱ Not in rotation';
      className += ' flag-warning';
    } else if (flag === 'web_inactive') {
      label = '† Web inactive';
      className += ' flag-danger';
    }
    return `<span class="${className}">${escapeHtml(label)}</span>`;
  }).join('');
}

function renderHostsTable(hosts) {
  if (!hosts || hosts.length === 0) return '';
  const rows = hosts.map((host) => `
    <tr class="${host.flags && host.flags.length > 0 ? 'row-flagged' : ''}">
      <td class="cell-name">${escapeHtml(host.name)}</td>
      <td>${escapeHtml(host.tier || '—')}</td>
      <td class="cell-ip">${escapeHtml(host.ip || '—')}</td>
      <td class="cell-type">${escapeHtml(host.type || '—')}</td>
      <td class="cell-az">${escapeHtml(host.az || '—')}</td>
      <td>${escapeHtml(host.os || '—')}</td>
      <td>${escapeHtml(host.vpc || '—')}</td>
      <td class="cell-mem">${escapeHtml(host.mem || '—')}</td>
      <td class="cell-flags">${getFlagBadgesHtml(host.flags)}</td>
    </tr>
  `).join('');

  return `
    <div class="hosts-table-wrapper">
      <table class="hosts-table">
        <thead>
          <tr>
            <th>Name</th><th>Tier</th><th>IP</th><th>Type</th><th>AZ</th>
            <th>OS</th><th>VPC</th><th>Mem</th><th>Flags</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderEntitlementsTable(entitlements) {
  if (!entitlements || entitlements.length === 0) return '';
  const rows = entitlements.map((entitlement, index) => `
    <tr>
      <td class="cell-index">${index + 1}</td>
      <td class="cell-entitlement">${escapeHtml(entitlement)}</td>
    </tr>
  `).join('');

  return `
    <div class="entitlements-table-wrapper">
      <table class="entitlements-table">
        <thead><tr><th>#</th><th>Entitlement</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function getDomainCheckStatusInfo(status) {
  if (!status) return { className: 'status-neutral', label: '—' };
  const lower = status.toLowerCase();
  if (lower.includes('pointed at elb ip')) return { className: 'status-warning', label: status };
  if (lower.includes('cloudflare')) return { className: 'status-info', label: status };
  if (lower.startsWith('ok')) return { className: 'status-ok', label: status };
  return { className: 'status-neutral', label: status };
}

function renderDomainCheckTable(summary, checks) {
  if (!checks || checks.length === 0) return '';

  let summaryHtml = '';
  if (summary) {
    const ips = (summary.ips || []).map((ip) => `<span class="summary-ip">${escapeHtml(ip)}</span>`).join('');
    summaryHtml = `
      <div class="domain-check-summary">
        <span class="summary-env">[${escapeHtml(summary.environment)}]</span>
        <span class="summary-sep">:</span>
        ${ips}
        ${summary.hostname ? `<span class="summary-hostname">${escapeHtml(summary.hostname)}</span>` : ''}
      </div>
    `;
  }

  const rows = checks.map((check) => {
    const { className, label } = getDomainCheckStatusInfo(check.status);
    return `
      <tr>
        <td class="cell-domain">${escapeHtml(check.domain)}</td>
        <td class="cell-resolved">${escapeHtml(check.resolved)}</td>
        <td><span class="status-badge ${className}">${escapeHtml(label)}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="domain-check-wrapper">
      ${summaryHtml}
      <div class="domain-check-table-wrapper">
        <table class="domain-check-table">
          <thead><tr><th>Domain</th><th>Resolved</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderServerInfoCard(info, configRaw) {
  if (!info) return '';

  let html = '<div class="server-info-card">';

  if (info.eip) {
    html += `
      <div class="eip-highlight">
        <span class="eip-label">EIP — use this for DNS repointing</span>
        <div class="eip-value-row">
          <span class="eip-value">${escapeHtml(info.eip)}</span>
          <button class="eip-copy-btn" data-eip="${escapeHtml(info.eip)}">Copy</button>
        </div>
      </div>
    `;
  }

  if (configRaw) {
    html += `
      <details class="server-config-details">
        <summary>Server Config (raw)</summary>
        <pre class="server-config-raw">${escapeHtml(configRaw)}</pre>
      </details>
    `;
  }

  html += '</div>';
  return html;
}

function getDigStatusClass(status) {
  if (!status) return 'dig-status-neutral';
  if (status === 'NOERROR') return 'dig-status-ok';
  if (status === 'NXDOMAIN') return 'dig-status-warning';
  return 'dig-status-error';
}

function renderDigResultCard(parsed) {
  const { status, question, answers, queryTime, server, when } = parsed;

  const answersHtml = answers && answers.length > 0
    ? `
      <div class="dig-answer-chain">
        ${answers.map((a) => `
          <div class="dig-answer-row">
            <span class="dig-answer-name">${escapeHtml(a.name)}</span>
            <span class="dig-answer-arrow">→</span>
            <span class="dig-answer-type">${escapeHtml(a.type)}</span>
            <span class="dig-answer-value">${escapeHtml(a.value)}</span>
            <span class="dig-answer-ttl">TTL ${escapeHtml(a.ttl)}s</span>
          </div>
        `).join('')}
      </div>
    `
    : `
      <div class="dig-no-answer">
        No answer records returned${status && status !== 'NOERROR' ? ` (status: ${escapeHtml(status)})` : ''}.
      </div>
    `;

  return `
    <div class="dig-result-card">
      <div class="dig-status-row">
        <span class="dig-status-badge ${getDigStatusClass(status)}">${escapeHtml(status || 'UNKNOWN')}</span>
        ${question ? `
          <span class="dig-question">
            ${escapeHtml(question.name)} <span class="dig-question-type">${escapeHtml(question.type)}</span>
          </span>
        ` : ''}
      </div>
      ${answersHtml}
      <div class="dig-meta">
        ${queryTime ? `<span>Query time: ${escapeHtml(queryTime)}</span>` : ''}
        ${server ? `<span>Server: ${escapeHtml(server)}</span>` : ''}
        ${when ? `<span>When: ${escapeHtml(when)}</span>` : ''}
      </div>
    </div>
  `;
}
