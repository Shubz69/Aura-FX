import React, { useMemo } from 'react';
import { marketActivityLevels } from './surveillancePresentation';

function confidenceClass(c) {
  if (c === 'high') return 'sv-mw-conf--high';
  if (c === 'medium') return 'sv-mw-conf--med';
  return 'sv-mw-conf--low';
}

export default function MarketWatchStrip({ narrative, items, variant = 'default' }) {
  const compact = variant === 'compact';
  const activityMap = useMemo(() => marketActivityLevels(items || []), [items]);

  if (narrative && narrative.length) {
    if (compact) {
      return (
        <div className="sv-strip sv-strip--compact sv-strip--narrative-compact" role="region" aria-label="Market watch narrative">
          <span className="sv-strip-label">Markets</span>
          <div className="sv-strip-compact-scroll">
            {narrative.map((g) => (
              <div key={g.groupId} className="sv-mw-compact-card" title={g.implication}>
                <div className="sv-mw-compact-head">
                  <strong className="sv-mw-label">{g.label}</strong>
                  <span
                    className={`sv-mw-conf ${confidenceClass(g.confidence)}`}
                    title="How strong this read is from the current tape"
                  >
                    {g.confidence === 'high' ? 'High confidence' : g.confidence === 'medium' ? 'Medium' : 'Tentative'}
                  </span>
                </div>
                <p className="sv-mw-impl-compact">{g.implication}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="sv-strip sv-strip--narrative" role="region" aria-label="Market watch narrative">
        <span className="sv-strip-label">Market watch</span>
        <div className="sv-strip-narrative-rows">
          {narrative.map((g) => (
            <div key={g.groupId} className="sv-mw-row">
              <div className="sv-mw-row-head">
                <strong className="sv-mw-label">{g.label}</strong>
                <span
                  className={`sv-mw-conf ${confidenceClass(g.confidence)}`}
                  title="How strong this read is from the current tape"
                >
                  {g.confidence === 'high' ? 'High confidence' : g.confidence === 'medium' ? 'Medium' : 'Tentative'}
                </span>
              </div>
              <p className="sv-mw-impl">{g.implication}</p>
              {g.reasons?.length ? (
                <ul className="sv-mw-reasons">
                  {g.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!items || !items.length) {
    return (
      <div className={`sv-strip sv-strip--empty ${compact ? 'sv-strip--compact' : ''}`}>
        <span className="sv-strip-label">{compact ? 'Markets' : 'Market watch'}</span>
        <span className="sv-strip-muted">{compact ? 'Flow pending' : 'Awaiting flow signals from the current tape'}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="sv-strip sv-strip--compact" role="region" aria-label="Market watch activity">
        <div className="sv-strip-compact-labels">
          <span className="sv-strip-label">Markets</span>
          <span className="sv-strip-activity-label">Activity level</span>
        </div>
        <div className="sv-strip-compact-scroll sv-strip-compact-scroll--chips">
          {items.map((x) => {
            const act = activityMap.get(x.symbol) || { label: 'LOW', band: 'low', title: '' };
            return (
              <span
                key={x.symbol}
                className={`sv-strip-chip sv-strip-chip--tight sv-strip-chip--act-${act.band}`}
                title={act.title}
              >
                <strong>{x.symbol}</strong>
                <span className="sv-strip-activity">{act.label}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="sv-strip" role="region" aria-label="Market watch activity">
      <div className="sv-strip-full-head">
        <span className="sv-strip-label">Market watch</span>
        <span className="sv-strip-activity-label">Activity level</span>
      </div>
      <div className="sv-strip-chips">
        {items.map((x) => {
          const act = activityMap.get(x.symbol) || { label: 'LOW', band: 'low', title: '' };
          return (
            <span key={x.symbol} className={`sv-strip-chip sv-strip-chip--act-${act.band}`} title={act.title}>
              <strong>{x.symbol}</strong>
              <span className="sv-strip-activity">{act.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
