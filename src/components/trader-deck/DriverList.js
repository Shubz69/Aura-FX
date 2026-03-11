import React from 'react';
import { ArrowIcon } from './MarketPulseGauge';

function impactLabel(impact) {
  if (!impact) return '—';
  const s = String(impact).toLowerCase();
  if (s === 'high') return 'High Impact';
  if (s === 'medium') return 'Medium Impact';
  if (s === 'low') return 'Low Impact';
  return `${impact} Impact`;
}

export default function DriverList({ drivers = [] }) {
  if (!drivers.length) {
    return (
      <ul className="td-mi-list td-mi-list--drivers">
        <li className="td-mi-list-empty">No driver data</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-list td-mi-list--drivers">
      {drivers.map((d, i) => (
        <li key={i} className="td-mi-list-item">
          <ArrowIcon direction={d.direction || 'neutral'} />
          <span className="td-mi-list-main"><strong>{d.name || d.title || '—'}</strong></span>
          <span className="td-mi-list-meta">{impactLabel(d.impact)}</span>
        </li>
      ))}
    </ul>
  );
}
