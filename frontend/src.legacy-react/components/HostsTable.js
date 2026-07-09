import React from 'react';
import './HostsTable.css';

function HostsTable({ hosts }) {
  if (!hosts || hosts.length === 0) return null;

  const getFlagBadges = (flags) => {
    if (!flags || flags.length === 0) return null;
    return flags.map((flag, i) => {
      let label = flag;
      let className = 'flag-badge';
      if (flag === 'not_in_rotation') {
        label = '✱ Not in rotation';
        className += ' flag-warning';
      } else if (flag === 'web_inactive') {
        label = '† Web inactive';
        className += ' flag-danger';
      }
      return (
        <span key={i} className={className}>{label}</span>
      );
    });
  };

  return (
    <div className="hosts-table-wrapper">
      <table className="hosts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Tier</th>
            <th>IP</th>
            <th>Type</th>
            <th>AZ</th>
            <th>OS</th>
            <th>VPC</th>
            <th>Mem</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((host, index) => (
            <tr key={index} className={host.flags && host.flags.length > 0 ? 'row-flagged' : ''}>
              <td className="cell-name">{host.name}</td>
              <td>{host.tier || '—'}</td>
              <td className="cell-ip">{host.ip || '—'}</td>
              <td className="cell-type">{host.type || '—'}</td>
              <td className="cell-az">{host.az || '—'}</td>
              <td>{host.os || '—'}</td>
              <td>{host.vpc || '—'}</td>
              <td className="cell-mem">{host.mem || '—'}</td>
              <td className="cell-flags">{getFlagBadges(host.flags)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HostsTable;
