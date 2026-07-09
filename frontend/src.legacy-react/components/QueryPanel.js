import React, { useState } from 'react';
import './QueryPanel.css';

function QueryPanel({ onQuery, onClear, loading }) {
  const [appName, setAppName] = useState('');
  const [env, setEnv] = useState('');
  const [serverName, setServerName] = useState('');
  const [digHostname, setDigHostname] = useState('');

  const handleGetEnvironments = () => {
    if (!appName.trim()) return;
    onQuery(appName.trim(), env.trim() || null, 'application:info');
  };

  const handleGetDomains = () => {
    if (!appName.trim()) return;
    if (!env.trim()) {
      alert('Environment is required for domain check.');
      return;
    }
    onQuery(appName.trim(), env.trim(), 'domains:list');
  };

  const handleCheckDomains = () => {
    if (!appName.trim()) return;
    if (!env.trim()) {
      alert('Environment is required for domain check.');
      return;
    }
    onQuery(appName.trim(), env.trim(), 'domains:check');
  };

  const handleGetServerInfo = () => {
    if (!serverName.trim()) return;
    onQuery(null, null, 'server', serverName.trim());
  };

  const handleRunDig = () => {
    if (!digHostname.trim()) return;
    onQuery(null, null, 'dig', null, digHostname.trim());
  };

  const handleClear = () => {
    setAppName('');
    setEnv('');
    setServerName('');
    setDigHostname('');
    onClear();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleGetEnvironments();
    }
  };

  const handleServerKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleGetServerInfo();
    }
  };

  const handleDigKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleRunDig();
    }
  };

  return (
    <div className="query-panel">
      <h2 className="query-panel-title">Query Parameters</h2>
      <div className="query-panel-inputs">
        <div className="input-group">
          <label className="input-label" htmlFor="app-name">
            Application / Docroot Name <span className="required">*</span>
          </label>
          <input
            id="app-name"
            type="text"
            className="input-field"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. acquia, rcn, marriott"
            disabled={loading}
          />
          <span className="input-helper">Provide the sitegroup/application name</span>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="env-name">
            Environment
          </label>
          <input
            id="env-name"
            type="text"
            className="input-field"
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. prod, 01live"
            disabled={loading}
          />
          <span className="input-helper">Provide the environment name</span>
        </div>
      </div>
      <div className="query-panel-actions">
        <button
          className="btn btn-blue"
          onClick={handleGetEnvironments}
          disabled={loading || !appName.trim()}
        >
          {loading ? 'LOADING...' : 'GET ENVIRONMENTS'}
        </button>
        <button
          className="btn btn-purple"
          onClick={handleGetDomains}
          disabled={loading || !appName.trim()}
        >
          DOMAIN LIST
        </button>
        <button
          className="btn btn-green"
          onClick={handleCheckDomains}
          disabled={loading || !appName.trim()}
        >
          DOMAINS POINTED
        </button>
        <button
          className="btn btn-outlined"
          onClick={handleClear}
          disabled={loading}
        >
          CLEAR RESULTS
        </button>
      </div>

      <div className="query-panel-divider"></div>

      <h2 className="query-panel-title">Server Lookup</h2>
      <p className="query-panel-subtitle">
        Look up a single server by hostname — used for finding the EIP when repointing customer DNS.
      </p>
      <div className="query-panel-inputs query-panel-inputs-single">
        <div className="input-group">
          <label className="input-label" htmlFor="server-name">
            Server Name
          </label>
          <input
            id="server-name"
            type="text"
            className="input-field"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            onKeyDown={handleServerKeyDown}
            placeholder="e.g. bal-12345"
            disabled={loading}
          />
          <span className="input-helper">Enter the server hostname (e.g. bal-12345, web-4836)</span>
        </div>
      </div>
      <div className="query-panel-actions">
        <button
          className="btn btn-amber"
          onClick={handleGetServerInfo}
          disabled={loading || !serverName.trim()}
        >
          {loading ? 'LOADING...' : 'GET SERVER INFO'}
        </button>
      </div>

      <div className="query-panel-divider"></div>

      <h2 className="query-panel-title">DNS Lookup (dig)</h2>
      <p className="query-panel-subtitle">
        Look up where a domain currently points. Paste a bare domain or a full URL — the protocol and path are stripped automatically.
      </p>
      <div className="query-panel-inputs query-panel-inputs-single">
        <div className="input-group">
          <label className="input-label" htmlFor="dig-hostname">
            Hostname / URL
          </label>
          <input
            id="dig-hostname"
            type="text"
            className="input-field"
            value={digHostname}
            onChange={(e) => setDigHostname(e.target.value)}
            onKeyDown={handleDigKeyDown}
            placeholder="e.g. www.example.com"
            disabled={loading}
          />
          <span className="input-helper">A full URL like https://example.com/page works too</span>
        </div>
      </div>
      <div className="query-panel-actions">
        <button
          className="btn btn-cyan"
          onClick={handleRunDig}
          disabled={loading || !digHostname.trim()}
        >
          {loading ? 'LOADING...' : 'RUN DIG'}
        </button>
      </div>
    </div>
  );
}

export default QueryPanel;
