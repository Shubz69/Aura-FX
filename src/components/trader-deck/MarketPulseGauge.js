import React from 'react';

/**
 * Semi-circular pulse gauge: Risk Off (red) → Neutral (yellow) → Risk On (green).
 * Needle rotates based on score 0–100. Badge shows current state.
 */
function ArrowIcon({ direction }) {
  if (direction === 'up') return <span className="td-mi-arrow td-mi-arrow--up" aria-hidden>↑</span>;
  if (direction === 'down') return <span className="td-mi-arrow td-mi-arrow--down" aria-hidden>↓</span>;
  return <span className="td-mi-arrow td-mi-arrow--neutral" aria-hidden>↔</span>;
}

export default function MarketPulseGauge({ score = 50, label = 'NEUTRAL', recommendedAction = [] }) {
  const normalized = Math.max(0, Math.min(100, Number(score)));
  // Needle: 0 = left (Risk Off), 100 = right (Risk On). Semi-circle = 180°; we use -90° to +90° (left to right)
  const rotation = -90 + (normalized / 100) * 180;

  const badgeClass =
    normalized <= 33 ? 'risk-off' : normalized <= 66 ? 'neutral' : 'risk-on';
  const volatility =
    normalized >= 72 ? 'Elevated' : normalized <= 34 ? 'Low' : 'Moderate';
  const directionalClarity =
    normalized >= 70 || normalized <= 30 ? 'Defined' : 'Mixed';
  const riskTone =
    normalized >= 67 ? 'Risk-on' : normalized <= 33 ? 'Risk-off' : 'Balanced';
  const posture =
    normalized >= 67 ? 'Lean with trend' : normalized <= 33 ? 'Defensive' : 'Selective';

  return (
    <div className="td-mi-gauge-wrap">
      <div className="td-mi-gauge" role="img" aria-label={`Market pulse ${label}, score ${normalized}`}>
        <div className="td-mi-gauge-arc-bg" aria-hidden />
        <div className="td-mi-gauge-arc-fill" aria-hidden />
        <div
          className="td-mi-gauge-needle"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-hidden
        />
      </div>
      <div className="td-mi-gauge-axis-labels">
        <span>RISK OFF</span>
        <span>RISK ON</span>
      </div>
      <div className={`td-mi-gauge-badge td-mi-gauge-badge--${badgeClass}`}>
        {label}
      </div>
      <div className="td-mi-pulse-snapshot">
        <p><span>State</span><strong>{label}</strong></p>
        <p><span>Confidence</span><strong>{normalized}%</strong></p>
        <p><span>Volatility</span><strong>{volatility}</strong></p>
        <p><span>Directional Clarity</span><strong>{directionalClarity}</strong></p>
        <p><span>Risk Tone</span><strong>{riskTone}</strong></p>
        <p><span>Posture</span><strong>{posture}</strong></p>
      </div>
      <div className="td-mi-pulse-meta">
        {Array.isArray(recommendedAction) && recommendedAction.length > 0 && (
          <>
            <p><strong>Action items:</strong></p>
            <ul className="td-mi-bullets">
              {recommendedAction.slice(0, 3).map((line, idx) => (
                <li key={idx} className="td-mi-bullet-item">{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export { ArrowIcon };
