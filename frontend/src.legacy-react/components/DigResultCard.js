import React from 'react';
import './DigResultCard.css';

function getStatusClass(status) {
  if (!status) return 'dig-status-neutral';
  if (status === 'NOERROR') return 'dig-status-ok';
  if (status === 'NXDOMAIN') return 'dig-status-warning';
  return 'dig-status-error';
}

function DigResultCard({ status, question, answers, queryTime, server, when }) {
  return (
    <div className="dig-result-card">
      <div className="dig-status-row">
        <span className={`dig-status-badge ${getStatusClass(status)}`}>{status || 'UNKNOWN'}</span>
        {question && (
          <span className="dig-question">
            {question.name} <span className="dig-question-type">{question.type}</span>
          </span>
        )}
      </div>

      {answers && answers.length > 0 ? (
        <div className="dig-answer-chain">
          {answers.map((a, i) => (
            <div className="dig-answer-row" key={i}>
              <span className="dig-answer-name">{a.name}</span>
              <span className="dig-answer-arrow">→</span>
              <span className="dig-answer-type">{a.type}</span>
              <span className="dig-answer-value">{a.value}</span>
              <span className="dig-answer-ttl">TTL {a.ttl}s</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dig-no-answer">
          No answer records returned{status && status !== 'NOERROR' ? ` (status: ${status})` : ''}.
        </div>
      )}

      <div className="dig-meta">
        {queryTime && <span>Query time: {queryTime}</span>}
        {server && <span>Server: {server}</span>}
        {when && <span>When: {when}</span>}
      </div>
    </div>
  );
}

export default DigResultCard;
