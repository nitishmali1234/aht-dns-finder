import React from 'react';
import HostsTable from './HostsTable';
import EntitlementsTable from './EntitlementsTable';
import DomainCheckTable from './DomainCheckTable';
import ServerInfoCard from './ServerInfoCard';
import DigResultCard from './DigResultCard';
import './ResultsPanel.css';

function ResultsPanel({ results, loading, error }) {
  if (loading) {
    return (
      <div className="results-panel">
        <div className="results-loading">
          <div className="spinner"></div>
          <span>Executing AHT command...</span>
        </div>
      </div>
    );
  }

  if (error && !results) {
    return (
      <div className="results-panel">
        <div className="results-error">
          <span className="error-icon">✕</span>
          <div className="error-content">
            <strong>Command Failed</strong>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="results-panel">
        <div className="results-empty">
          <span className="empty-icon">⌘</span>
          <p>Run a query to see results here.</p>
        </div>
      </div>
    );
  }

  const { raw, parsed, warnings, command, timestamp } = results;
  const hasDomains = parsed && parsed.domains;
  const hasEnvironments = parsed && parsed.environments && parsed.environments.length > 0;
  const hasEntitlements = parsed && parsed.entitlements && parsed.entitlements.length > 0;
  const hasChecks = parsed && parsed.checks && parsed.checks.length > 0;
  const hasServerInfo = parsed && parsed.info && Object.keys(parsed.info).length > 0;
  const hasDigResult = parsed && parsed.question;

  return (
    <div className="results-panel">
      {/* Timestamp and command */}
      <div className="results-meta">
        <div className="meta-row">
          <span className="meta-label">Timestamp:</span>
          <span className="meta-value">{timestamp}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Command:</span>
          <code className="meta-command">{command}</code>
        </div>
      </div>

      {/* Error banner if error came with partial results */}
      {error && (
        <div className="results-error results-error-inline">
          <span className="error-icon">✕</span>
          <p>{error}</p>
        </div>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="results-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="warning-line">
              <span className="warning-icon">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* One card per environment — some applications (ACSF/multi-env sites)
          return several environments' info+hosts in a single response */}
      {hasEnvironments && parsed.environments.map((envBlock, idx) => {
        const info = envBlock.info || {};
        const label = info.displayName || info.environment || `Environment ${idx + 1}`;
        return (
          <div className="results-section environment-card" key={idx}>
            <h3 className="section-title">
              {label}
              {info.sitename && <span className="env-sitename"> — {info.sitename}</span>}
            </h3>
            <details className="collapsible-block">
              <summary className="collapsible-summary">Environment Details</summary>
              <div className="app-info-grid">
                {info.environment && (
                  <div className="info-item">
                    <span className="info-label">Environment</span>
                    <span className="info-value">{info.environment}</span>
                  </div>
                )}
                {info.sitename && (
                  <div className="info-item">
                    <span className="info-label">Sitename</span>
                    <span className="info-value">{info.sitename}</span>
                  </div>
                )}
                {info.displayName && (
                  <div className="info-item">
                    <span className="info-label">Display Name</span>
                    <span className="info-value">{info.displayName}</span>
                  </div>
                )}
                {info.revision && (
                  <div className="info-item">
                    <span className="info-label">Revision</span>
                    <span className="info-value mono">{info.revision}</span>
                  </div>
                )}
                {info.php && (
                  <div className="info-item">
                    <span className="info-label">PHP</span>
                    <span className="info-value">{info.php}</span>
                  </div>
                )}
                {info.applicationType && (
                  <div className="info-item">
                    <span className="info-label">Application Type</span>
                    <span className="info-value">{info.applicationType}</span>
                  </div>
                )}
                {info.provider && (
                  <div className="info-item">
                    <span className="info-label">Provider</span>
                    <span className="info-value">{info.provider}</span>
                  </div>
                )}
                {info.tags && info.tags.length > 0 && (
                  <div className="info-item">
                    <span className="info-label">Tags</span>
                    <span className="info-value">{info.tags.join(', ')}</span>
                  </div>
                )}
              </div>
            </details>

            {envBlock.hosts && envBlock.hosts.length > 0 && (
              <div className="environment-hosts">
                <h4 className="subsection-title">Hosts</h4>
                <HostsTable hosts={envBlock.hosts} />
                {envBlock.footnotes && envBlock.footnotes.length > 0 && (
                  <div className="footnotes">
                    {envBlock.footnotes.map((fn, i) => (
                      <div key={i} className="footnote-line">{fn}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Entitlements table — applies to the whole site, shown once, collapsed by default */}
      {hasEntitlements && (
        <div className="results-section">
          <details className="collapsible-block">
            <summary className="collapsible-summary section-title-summary">Entitlements</summary>
            <EntitlementsTable entitlements={parsed.entitlements} />
          </details>
        </div>
      )}

      {/* Domains list */}
      {hasDomains && parsed.domains.length > 0 && (
        <div className="results-section">
          <h3 className="section-title">Domains ({parsed.domains.length})</h3>
          <div className="domains-list">
            {parsed.domains.map((d, i) => (
              <div key={i} className="domain-row">
                <span className="domain-name">{d.name}</span>
                {d.type && <span className="domain-tag">{d.type}</span>}
                {d.status && <span className="domain-tag">{d.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Domain check results */}
      {hasChecks && (
        <div className="results-section">
          <h3 className="section-title">Domain Check ({parsed.checks.length})</h3>
          <DomainCheckTable summary={parsed.summary} checks={parsed.checks} />
        </div>
      )}

      {hasServerInfo && (
        <div className="results-section">
          <h3 className="section-title">Server Info</h3>
          <ServerInfoCard info={parsed.info} configRaw={parsed.configRaw} />
        </div>
      )}

      {hasDigResult && (
        <div className="results-section">
          <h3 className="section-title">DNS Lookup</h3>
          <DigResultCard
            status={parsed.status}
            question={parsed.question}
            answers={parsed.answers}
            queryTime={parsed.queryTime}
            server={parsed.server}
            when={parsed.when}
          />
        </div>
      )}

      {/* Raw output — collapsed by default */}
      {raw && (
        <div className="results-section">
          <details className="collapsible-block">
            <summary className="collapsible-summary section-title-summary">Raw Output</summary>
            <pre className="raw-output">{raw}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default ResultsPanel;
