import React from 'react';
import { formatSessionStateLabel, currentSessionShortLabel } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

const SESSION_ORDER = [
  { id: 'asia', label: 'Asia', icon: '◉' },
  { id: 'london', label: 'London', icon: '◆' },
  { id: 'newYork', label: 'New York', icon: '▣' },
];

export default function SessionContextPanel({ sessionContext }) {
  const sc = sessionContext && sessionContext.sessions ? sessionContext : null;
  const current = sc ? String(sessionContext.currentSession || '').toLowerCase() : '';

  return (
    <div className="mo-session-context" aria-label="Session context">
      {SESSION_ORDER.map(({ id, label, icon }) => {
        const row = sc && sc.sessions ? sc.sessions[id] : null;
        const stateKey = row && row.state ? row.state : 'inactive';
        const stateLabel = formatSessionStateLabel(stateKey);
        const tag = row && Array.isArray(row.tags) && row.tags[0] ? row.tags[0] : null;
        const isLive =
          (id === 'asia' && (current === 'asia' || current === 'overlap')) ||
          (id === 'london' && (current === 'london' || current === 'overlap')) ||
          (id === 'newYork' && (current === 'new_york' || current === 'overlap'));
        return (
          <div
            key={id}
            className={`mo-dense-row mo-session-context__row${isLive ? ' mo-session-context__row--live' : ''}`}
          >
            <span className="mo-session-context__glow" aria-hidden />
            <span className="mo-session-context__icon" aria-hidden>{icon}</span>
            <div className="mo-session-context__main">
              <div className="mo-session-context__top">
                <span className="mo-dense-row__title">{label}</span>
                <span className="mo-pill mo-pill--state">{stateLabel}</span>
              </div>
              {tag ? (
                <span className="mo-dense-row__meta mo-session-context__tag">{tag}</span>
              ) : row && row.summary ? (
                <span className="mo-dense-row__meta mo-session-context__hint">{row.summary}</span>
              ) : null}
            </div>
          </div>
        );
      })}
      {current ? (
        <p className="mo-session-context__foot">
          Active window: <strong>{currentSessionShortLabel(current)}</strong>
        </p>
      ) : null}
    </div>
  );
}
