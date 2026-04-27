import React from 'react';

/**
 * Top Aura Pulse strip — compresses regime + driver + action.
 * @param {{ pulse?: Record<string, unknown> | null, loading?: boolean }} props
 */
export default function AuraPulseBar({ pulse, loading }) {
  if (loading) {
    return (
      <div className="oi-pulse oi-pulse--loading" role="status" aria-live="polite">
        <span className="oi-pulse__loading">Loading pulse…</span>
      </div>
    );
  }
  if (!pulse) {
    return (
      <div className="oi-pulse oi-pulse--empty" role="status">
        <span className="oi-pulse__loading">Pulse unavailable</span>
      </div>
    );
  }

  const items = [
    { k: 'MARKET STATE', v: pulse.marketState },
    { k: 'BIAS', v: pulse.bias },
    { k: 'VOLATILITY', v: pulse.volatility },
    { k: 'STRUCTURE', v: pulse.structure },
    { k: 'CONVICTION', v: `${pulse.convictionPct}%` },
    { k: 'KEY DRIVER', v: pulse.keyDriver, wide: true },
    { k: 'RECOMMENDED ACTION', v: pulse.recommendedAction, wide: true, accent: true },
  ];

  return (
    <div className="oi-pulse" role="region" aria-label="Aura pulse">
      {items.map((row) => (
        <div
          key={row.k}
          className={`oi-pulse__cell${row.wide ? ' oi-pulse__cell--wide' : ''}${row.accent ? ' oi-pulse__cell--accent' : ''}`}
        >
          <span className="oi-pulse__label">{row.k}</span>
          <span className="oi-pulse__value">{row.v}</span>
        </div>
      ))}
    </div>
  );
}
