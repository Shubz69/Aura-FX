import React from 'react';

function scoreBar(label, value, max = 100) {
  const pct = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <div className="oi-bias-row" key={label}>
      <span className="oi-bias-row__label">{label}</span>
      <div className="oi-bias-row__track" aria-hidden>
        <span className="oi-bias-row__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="oi-bias-row__num">{pct}</span>
    </div>
  );
}

/**
 * @param {{ bias?: Record<string, unknown> | null, loading?: boolean }} props
 */
export default function OperatorBiasEngine({ bias, loading }) {
  if (loading) {
    return (
      <div className="oi-card oi-card--bias" role="status">
        <div className="oi-card__head">
          <span className="oi-card__title">Operator bias engine</span>
        </div>
        <p className="oi-card__muted">Loading bias…</p>
      </div>
    );
  }
  if (!bias) {
    return (
      <div className="oi-card oi-card--bias" role="status">
        <div className="oi-card__head">
          <span className="oi-card__title">Operator bias engine</span>
        </div>
        <p className="oi-card__muted">Bias engine unavailable.</p>
      </div>
    );
  }

  return (
    <div className="oi-card oi-card--bias">
      <div className="oi-card__head">
        <span className="oi-card__title">Operator bias engine</span>
        <span className={`oi-chip oi-chip--bias-${String(bias.biasLabel || 'neutral').toLowerCase()}`}>
          {bias.biasLabel}
        </span>
      </div>
      <div className="oi-bias-breakdown">
        <p className="oi-bias-kicker">Bias breakdown</p>
        {scoreBar('Directional', bias.directionalScore)}
        {scoreBar('Technical', bias.technicalScore)}
        {scoreBar('Fundamental', bias.fundamentalScore)}
        {scoreBar('Sentiment', bias.sentimentScore)}
        {scoreBar('Flow', bias.flowScore)}
        {scoreBar('Positioning', bias.positioningScore)}
      </div>
      <div className="oi-bias-footer">
        <div>
          <span className="oi-metric-label">Overall conviction</span>
          <span className="oi-metric-value oi-metric-value--gold">{bias.overallConvictionPct}%</span>
        </div>
        <div className="oi-bias-guidance">
          <span className="oi-metric-label">Execution guidance</span>
          <p>{bias.executionGuidance}</p>
        </div>
      </div>
    </div>
  );
}
