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

const OUTLOOK_METRIC_ROWS = [
  { key: 'regimeScore', label: 'Regime score', format: (v) => (v == null || v === '' ? '—' : `${v}/100`) },
  { key: 'regimeBiasLabel', label: 'Structural bias', format: (v) => (v ? String(v) : '—') },
  { key: 'trendState', label: 'Trend state', format: (v) => (v ? String(v) : '—') },
  { key: 'volatilityRegime', label: 'Volatility regime', format: (v) => (v ? String(v) : '—') },
  { key: 'liquidityCondition', label: 'Liquidity', format: (v) => (v ? String(v) : '—') },
  { key: 'convictionLevel', label: 'Conviction', format: (v) => (v ? String(v) : '—') },
];

export default function RegimeRows({ regime }) {
  if (!regime) return null;
  const extra = OPTIONAL_ROWS.filter(({ key }) => regime[key] != null && String(regime[key]).trim() !== '');
  const hasOutlook = regime.regimeScore != null && Number.isFinite(Number(regime.regimeScore));
  const outlookRows = hasOutlook
    ? OUTLOOK_METRIC_ROWS.filter(({ key }) => regime[key] != null && String(regime[key]).trim() !== '')
    : [];
  const rows = [...BASE_ROWS, ...extra];
  return (
    <div className="td-mi-regime-rows">
      {rows.map(({ key, label }) => (
        <div key={key} className="td-mi-regime-row">
          <span className="td-mi-regime-label">{label}:</span>
          <span className="td-mi-regime-value">{regime[key] || '—'}</span>
        </div>
      ))}
      {outlookRows.map(({ key, label, format }) => (
        <div key={key} className="td-mi-regime-row td-mi-regime-row--outlook">
          <span className="td-mi-regime-label">{label}:</span>
          <span className="td-mi-regime-value">{format(regime[key])}</span>
        </div>
      ))}
      {regime.regimeNarrative && String(regime.regimeNarrative).trim() ? (
        <p className="td-mi-regime-narrative">{String(regime.regimeNarrative).trim()}</p>
      ) : null}
    </div>
  );
}
