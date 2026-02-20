import React from 'react';
import '../../../styles/aura-analysis/AuraTabSection.css';

const METRICS = [
  { id: 'equity', label: 'Equity' },
  { id: 'netPl', label: 'Net P/L' },
  { id: 'winRate', label: 'Win Rate' },
  { id: 'profitFactor', label: 'Profit Factor' },
  { id: 'expectancy', label: 'Expectancy' },
  { id: 'avgRR', label: 'Average RR' },
  { id: 'maxDD', label: 'Max Drawdown' },
  { id: 'currentDD', label: 'Current Drawdown' },
  { id: 'riskUsage', label: 'Risk Usage' },
  { id: 'disciplineScore', label: 'Discipline Score' },
];

export default function Overview() {
  return (
    <div className="aura-tab-page">
      <h1 className="aura-tab-title">Command Center</h1>
      <p className="aura-tab-sub">High-level metrics at a glance</p>
      <div className="aura-tab-grid">
        {METRICS.map((m) => (
          <div key={m.id} className="aura-tab-card">
            <div className="aura-tab-card-label">{m.label}</div>
            <div className="aura-tab-card-value">—</div>
          </div>
        ))}
      </div>
    </div>
  );
}
