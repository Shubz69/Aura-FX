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

function badgeClassFromLabelAndScore(label, normalized) {
  const u = String(label || '').toUpperCase();
  if (/\bRISK\s*ON\b|\bBULLISH\b/.test(u)) return 'risk-on';
  if (/\bRISK\s*OFF\b|\bBEARISH\b/.test(u)) return 'risk-off';
  if (/\bMIXED\b|\bNEUTRAL\b/.test(u)) return 'neutral';
  if (normalized <= 33) return 'risk-off';
  if (normalized <= 66) return 'neutral';
  return 'risk-on';
}

export default function MarketPulseGauge({
  score = 50,
  label = 'NEUTRAL',
  recommendedAction = [],
  /** Outlook: observational dynamics (preferred over recommendedAction when set) */
  outlookPulse = null,
  variant = 'default',
  /** Short regime line from Market Regime (e.g. currentRegime); outlook only */
  regimeDescriptor = '',
}) {
  const normalized = Math.max(0, Math.min(100, Number(score)));
  // Needle: 0 = left (Risk Off), 100 = right (Risk On). Semi-circle = 180°; we use -90° to +90° (left to right)
  const rotation = -90 + (normalized / 100) * 180;

  const badgeClass = badgeClassFromLabelAndScore(label, normalized);
  const volatility =
    normalized >= 72 ? 'Elevated' : normalized <= 34 ? 'Low' : 'Moderate';
  const directionalClarity =
    normalized >= 70 || normalized <= 30 ? 'Defined' : 'Mixed';
  const riskTone =
    normalized >= 67 ? 'Risk-on' : normalized <= 33 ? 'Risk-off' : 'Balanced';
  const posture =
    normalized >= 67 ? 'Lean with trend' : normalized <= 33 ? 'Defensive' : 'Selective';

  const outlook = variant === 'outlook';
  const op = outlookPulse && typeof outlookPulse === 'object' ? outlookPulse : null;
  const outlookVol = op?.volatilityCondition || (normalized >= 72 ? 'Elevated pulse vs baseline' : normalized <= 34 ? 'Subdued pulse vs baseline' : 'Balanced pulse vs baseline');
  const shiftLines = Array.isArray(op?.stateShiftFactors) && op.stateShiftFactors.length
    ? op.stateShiftFactors
    : (Array.isArray(recommendedAction) ? recommendedAction : []);

  return (
    <div className={`td-mi-gauge-wrap${outlook ? ' td-mi-gauge-wrap--outlook' : ''}`}>
      <div
        className={`td-mi-gauge${outlook ? ' td-mi-gauge--outlook' : ''}`}
        role="img"
        aria-label={`Market pulse ${label}, score ${normalized}`}
      >
        <div className="td-mi-gauge-arc-bg" aria-hidden />
        {outlook ? <div className="td-mi-gauge-arc-glow" aria-hidden /> : null}
        <div className="td-mi-gauge-arc-fill" aria-hidden />
        <div
          className="td-mi-gauge-needle"
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-hidden
        />
      </div>
      <div className="td-mi-gauge-axis-labels">
        <span>{outlook ? 'Risk off' : 'RISK OFF'}</span>
        <span>{outlook ? 'Risk on' : 'RISK ON'}</span>
      </div>
      <div className={`td-mi-gauge-badge td-mi-gauge-badge--${badgeClass}`}>
        {label}
      </div>
      {outlook ? (
        <>
          <div className="td-mi-pulse-snapshot td-mi-pulse-snapshot--compact">
            <p><span>State</span><strong>{op?.pulseState || label} ({normalized}%)</strong></p>
            <p><span>Volatility</span><strong>{outlookVol}</strong></p>
            {regimeDescriptor ? (
              <p><span>Regime</span><strong>{regimeDescriptor}</strong></p>
            ) : null}
            <p><span>Clarity</span><strong>{directionalClarity}</strong></p>
          </div>
          {Array.isArray(op?.topDrivers) && op.topDrivers.length > 0 ? (
            <div className="td-mi-pulse-meta td-mi-pulse-meta--drivers">
              <p className="td-mi-pulse-actions-label">Top drivers</p>
              <ul className="td-mi-bullets td-mi-pulse-actions-list">
                {op.topDrivers.slice(0, 3).map((line, idx) => (
                  <li key={idx} className="td-mi-bullet-item">{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {op?.recentChangeSummary ? (
            <p className="td-mi-pulse-recent"><span>Recent shift</span><strong>{op.recentChangeSummary}</strong></p>
          ) : null}
          {Array.isArray(shiftLines) && shiftLines.length > 0 && (
            <div className="td-mi-pulse-meta td-mi-pulse-meta--actions">
              <p className="td-mi-pulse-actions-label">What could shift the tape</p>
              <ul className="td-mi-bullets td-mi-pulse-actions-list">
                {shiftLines.slice(0, 4).map((line, idx) => (
                  <li key={idx} className="td-mi-bullet-item">{line}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
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
                <p><strong>Desk context:</strong></p>
                <ul className="td-mi-bullets">
                  {recommendedAction.slice(0, 3).map((line, idx) => (
                    <li key={idx} className="td-mi-bullet-item">{line}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { ArrowIcon };
