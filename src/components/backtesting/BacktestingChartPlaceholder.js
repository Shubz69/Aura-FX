import React from 'react';

/**
 * Pre-embed or fallback state — session time and transport remain authoritative.
 * @param {'default'|'embed-failed'} [variant]
 */
export default function BacktestingChartPlaceholder({ replayAtLabel, session, variant = 'default' }) {
  const completed = session?.status === 'completed';
  const lead =
    variant === 'embed-failed'
      ? 'The embedded chart could not load (network or provider). Replay controls, session logging, notebook, and reports still work.'
      : 'Simulated session time is driven by the transport below. Keep logging executions and journaling as you step — the chart mount above stays independent of Aura replay state.';
  return (
    <div className={`bt-chart-stage__placeholder${completed ? ' bt-chart-stage__placeholder--archived' : ''}`}>
      <div className="bt-chart-stage__placeholder-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="bt-chart-stage__placeholder-copy">
        <p className="bt-chart-stage__placeholder-title">{variant === 'embed-failed' ? 'Chart unavailable' : 'Replay surface'}</p>
        <p className="bt-chart-stage__placeholder-lead">{lead}</p>
        <p className="bt-chart-stage__placeholder-meta">
          <span className="bt-chart-stage__placeholder-time">{replayAtLabel}</span>
        </p>
      </div>
    </div>
  );
}
