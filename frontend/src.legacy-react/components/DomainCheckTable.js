import React from 'react';
import './DomainCheckTable.css';

function getStatusInfo(status) {
  if (!status) return { className: 'status-neutral', label: '—' };
  const lower = status.toLowerCase();

  if (lower.includes('pointed at elb ip')) {
    return { className: 'status-warning', label: status };
  }
  if (lower.includes('cloudflare')) {
    return { className: 'status-info', label: status };
  }
  if (lower.startsWith('ok')) {
    return { className: 'status-ok', label: status };
  }
  return { className: 'status-neutral', label: status };
}

function DomainCheckTable({ summary, checks }) {
  if (!checks || checks.length === 0) return null;

  return (
    <div className="domain-check-wrapper">
      {summary && (
        <div className="domain-check-summary">
          <span className="summary-env">[{summary.environment}]</span>
          <span className="summary-sep">:</span>
          {summary.ips && summary.ips.map((ip, i) => (
            <span key={i} className="summary-ip">{ip}</span>
          ))}
          {summary.hostname && (
            <span className="summary-hostname">{summary.hostname}</span>
          )}
        </div>
      )}
      <div className="domain-check-table-wrapper">
        <table className="domain-check-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Resolved</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check, index) => {
              const { className, label } = getStatusInfo(check.status);
              return (
                <tr key={index}>
                  <td className="cell-domain">{check.domain}</td>
                  <td className="cell-resolved">{check.resolved}</td>
                  <td>
                    <span className={`status-badge ${className}`}>{label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DomainCheckTable;
