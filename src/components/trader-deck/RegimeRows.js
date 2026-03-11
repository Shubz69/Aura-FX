import React from 'react';

const ROWS = [
  { key: 'currentRegime', label: 'Current Regime' },
  { key: 'primaryDriver', label: 'Primary Driver' },
  { key: 'secondaryDriver', label: 'Secondary Driver' },
  { key: 'marketSentiment', label: 'Market Sentiment' },
];

export default function RegimeRows({ regime }) {
  if (!regime) return null;
  return (
    <div className="td-mi-regime-rows">
      {ROWS.map(({ key, label }) => (
        <div key={key} className="td-mi-regime-row">
          <span className="td-mi-regime-label">{label}:</span>
          <span className="td-mi-regime-value">{regime[key] || '—'}</span>
        </div>
      ))}
    </div>
  );
}
