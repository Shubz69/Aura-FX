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
      <div className="td-mi-pulse-meta">
        <p><strong>Market State:</strong> {label}</p>
        <p><strong>Confidence:</strong> {normalized}%</p>
        {Array.isArray(recommendedAction) && recommendedAction.length > 0 && (
          <>
            <p><strong>Recommended Action:</strong></p>
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
