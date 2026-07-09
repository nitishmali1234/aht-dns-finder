import React from 'react';
import './EntitlementsTable.css';

function EntitlementsTable({ entitlements }) {
  if (!entitlements || entitlements.length === 0) return null;

  return (
    <div className="entitlements-table-wrapper">
      <table className="entitlements-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Entitlement</th>
          </tr>
        </thead>
        <tbody>
          {entitlements.map((entitlement, index) => (
            <tr key={index}>
              <td className="cell-index">{index + 1}</td>
              <td className="cell-entitlement">{entitlement}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EntitlementsTable;
