import React from 'react';

const BASE_ROWS = [
  { key: 'currentRegime', label: 'Regime' },
  { key: 'bias', label: 'Bias' },
  { key: 'primaryDriver', label: 'Primary Driver' },
  { key: 'secondaryDriver', label: 'Secondary Driver' },
  { key: 'marketSentiment', label: 'Global Sentiment' },
  { key: 'tradeEnvironment', label: 'Trade Environment' },
];

const OPTIONAL_ROWS = [
  { key: 'biasStrength', label: 'Bias strength' },
  { key: 'convictionClarity', label: 'Conviction / clarity' },
];

export default function RegimeRows({ regime }) {
  if (!regime) return null;
  const extra = OPTIONAL_ROWS.filter(({ key }) => regime[key] != null && String(regime[key]).trim() !== '');
  const rows = [...BASE_ROWS, ...extra];
  return (
    <div className="td-mi-regime-rows">
      {rows.map(({ key, label }) => (
        <div key={key} className="td-mi-regime-row">
          <span className="td-mi-regime-label">{label}:</span>
          <span className="td-mi-regime-value">{regime[key] || '—'}</span>
        </div>
      ))}
    </div>
  );
}
