import React from 'react';
import { ArrowIcon } from './MarketPulseGauge';

export default function SignalList({ signals = [] }) {
  if (!signals.length) {
    return (
      <ul className="td-mi-list td-mi-list--signals">
        <li className="td-mi-list-empty">No signal data</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-list td-mi-list--signals">
      {signals.map((s, i) => (
        <li key={i} className="td-mi-list-item">
          <ArrowIcon direction={s.direction || 'neutral'} />
          <span className="td-mi-list-main"><strong>{s.asset || '—'}:</strong></span>
          <span className="td-mi-list-meta">{s.signal || s.label || '—'}</span>
        </li>
      ))}
    </ul>
  );
}
