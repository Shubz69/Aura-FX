import React from 'react';
import { ArrowIcon } from './MarketPulseGauge';

function strengthLabel(s) {
  const st = String(s || '').toLowerCase();
  if (st === 'strong') return 'Strong';
  if (st === 'moderate') return 'Moderate';
  if (st === 'weak') return 'Soft';
  return s ? String(s) : '—';
}

export default function SignalList({ signals = [] }) {
  if (!signals.length) {
    return (
      <ul className="td-mi-list td-mi-list--signals">
        <li className="td-mi-list-empty">No signal data</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-list td-mi-list--signals td-mi-list--signals-dense">
      {signals.map((s, i) => (
        <li key={i} className="td-mi-list-item td-mi-list-item--signal-dense">
          <div className="td-mi-list-item__row">
            <ArrowIcon direction={s.direction || 'neutral'} />
            <span className="td-mi-list-main"><strong>{s.asset || '—'}</strong></span>
            <span className="td-mi-list-meta">{s.signal || s.label || '—'}</span>
            {s.strength ? (
              <span className="td-mi-sig-strength" title="Strength">{strengthLabel(s.strength)}</span>
            ) : null}
          </div>
          {s.implication ? (
            <p className="td-mi-list-implication">{s.implication}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
