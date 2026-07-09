import React, { useState } from 'react';
import './ServerInfoCard.css';

function ServerInfoCard({ info, configRaw }) {
  const [copied, setCopied] = useState(false);

  if (!info) return null;

  const handleCopyEip = () => {
    if (!info.eip) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(info.eip).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {});
    }
  };

  return (
    <div className="server-info-card">
      {info.eip && (
        <div className="eip-highlight">
          <span className="eip-label">EIP — use this for DNS repointing</span>
          <div className="eip-value-row">
            <span className="eip-value">{info.eip}</span>
            <button className="eip-copy-btn" onClick={handleCopyEip}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/*
        Server Info grid (Name, Realm, Instance ID, Size, vCPU, etc.) —
        commented out per request. Only the EIP box and Server Config
        below should be shown.
      <div className="server-info-grid">
        {FIELD_LABELS.map(([key, label]) => (
          info[key] ? (
            <div className="info-item" key={key}>
              <span className="info-label">{label}</span>
              <span className="info-value">{info[key]}</span>
            </div>
          ) : null
        ))}
      </div>
      */}

      {configRaw && (
        <details className="server-config-details">
          <summary>Server Config (raw)</summary>
          <pre className="server-config-raw">{configRaw}</pre>
        </details>
      )}
    </div>
  );
}

export default ServerInfoCard;
