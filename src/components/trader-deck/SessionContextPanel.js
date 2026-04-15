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
        const sessionStyleChip = row.sessionStyle && row.sessionStyle !== stateLabel ? row.sessionStyle : null;
        const biasLine = row.sessionBias || '';
        const expectLine = row.expectedBehaviour || '';
        const volExp = row.volatilityExpectation || '';
        const keyLv = row.keyLevelNote || '';
        const narrative = row.narrative || row.summary || '';
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
              <div className="mo-session-context__chips">
                {sessionStyleChip ? <span className="mo-pill mo-pill--soft">{sessionStyleChip}</span> : null}
                {biasLine ? <span className="mo-pill mo-pill--soft">{biasLine}</span> : null}
                {tag ? <span className="mo-pill mo-pill--tag">{tag}</span> : null}
              </div>
              {expectLine ? (
                <p className="mo-session-context__line mo-session-context__line--expect">{expectLine}</p>
              ) : null}
              {volExp ? (
                <p className="mo-session-context__line mo-session-context__line--vol">
                  <span className="mo-session-context__k">Volatility</span>
                  {volExp}
                </p>
              ) : null}
              {keyLv ? (
                <p className="mo-session-context__line mo-session-context__line--levels">
                  <span className="mo-session-context__k">Levels</span>
                  {keyLv}
                </p>
              ) : null}
              {narrative ? (
                <p className="mo-session-context__narrative">{narrative}</p>
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
