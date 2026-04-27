import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const normalized = Math.max(0, Math.min(100, Number(score)));
  const rotation = -90 + (normalized / 100) * 180;

  const badgeClass = badgeClassFromLabelAndScore(label, normalized);

  const { volatility, directionalClarity, riskTone, posture } = useMemo(() => ({
    volatility:
      normalized >= 72 ? t('traderDeck.pulse.volElevated') : normalized <= 34 ? t('traderDeck.pulse.volLow') : t('traderDeck.pulse.volModerate'),
    directionalClarity:
      normalized >= 70 || normalized <= 30 ? t('traderDeck.pulse.clarityDefined') : t('traderDeck.pulse.clarityMixed'),
    riskTone:
      normalized >= 67 ? t('traderDeck.pulse.riskOnTone') : normalized <= 33 ? t('traderDeck.pulse.riskOffTone') : t('traderDeck.pulse.riskBalanced'),
    posture:
      normalized >= 67 ? t('traderDeck.pulse.postureLeanTrend') : normalized <= 33 ? t('traderDeck.pulse.postureDefensive') : t('traderDeck.pulse.postureSelective'),
  }), [normalized, t]);

  const outlook = variant === 'outlook';
  const op = outlookPulse && typeof outlookPulse === 'object' ? outlookPulse : null;
  const outlookVol = op?.volatilityCondition
    || (normalized >= 72
      ? t('traderDeck.pulse.outlookVolElevated')
      : normalized <= 34
        ? t('traderDeck.pulse.outlookVolSubdued')
        : t('traderDeck.pulse.outlookVolBalanced'));
  const shiftLines = Array.isArray(op?.stateShiftFactors) && op.stateShiftFactors.length
    ? op.stateShiftFactors
    : (Array.isArray(recommendedAction) ? recommendedAction : []);

  return (
    <div className={`td-mi-gauge-wrap${outlook ? ' td-mi-gauge-wrap--outlook' : ''}`}>
      <div
        className={`td-mi-gauge${outlook ? ' td-mi-gauge--outlook' : ''}`}
        role="img"
        aria-label={t('traderDeck.pulse.aria', { label, score: normalized })}
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
        <span>{outlook ? t('traderDeck.pulse.axisRiskOff') : t('traderDeck.pulse.axisRiskOff')}</span>
        <span>{outlook ? t('traderDeck.pulse.axisRiskOn') : t('traderDeck.pulse.axisRiskOn')}</span>
      </div>
      <div className={`td-mi-gauge-badge td-mi-gauge-badge--${badgeClass}`}>
        {label}
      </div>
      {outlook ? (
        <>
          <div className="td-mi-pulse-snapshot td-mi-pulse-snapshot--compact">
            <p><span>{t('traderDeck.pulse.state')}</span><strong>{op?.pulseState || label} ({normalized}%)</strong></p>
            <p><span>{t('traderDeck.pulse.volatility')}</span><strong>{outlookVol}</strong></p>
            {regimeDescriptor ? (
              <p><span>{t('traderDeck.pulse.regime')}</span><strong>{regimeDescriptor}</strong></p>
            ) : null}
            <p><span>{t('traderDeck.pulse.clarity')}</span><strong>{directionalClarity}</strong></p>
          </div>
          {Array.isArray(op?.topDrivers) && op.topDrivers.length > 0 ? (
            <div className="td-mi-pulse-meta td-mi-pulse-meta--drivers">
              <p className="td-mi-pulse-actions-label">{t('traderDeck.pulse.topDrivers')}</p>
              <ul className="td-mi-bullets td-mi-pulse-actions-list">
                {op.topDrivers.slice(0, 3).map((line, idx) => (
                  <li key={idx} className="td-mi-bullet-item">{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {op?.recentChangeSummary ? (
            <p className="td-mi-pulse-recent"><span>{t('traderDeck.pulse.recentShift')}</span><strong>{op.recentChangeSummary}</strong></p>
          ) : null}
          {Array.isArray(shiftLines) && shiftLines.length > 0 && (
            <div className="td-mi-pulse-meta td-mi-pulse-meta--actions">
              <p className="td-mi-pulse-actions-label">{t('traderDeck.pulse.whatShiftTape')}</p>
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
            <p><span>{t('traderDeck.pulse.state')}</span><strong>{label}</strong></p>
            <p><span>{t('traderDeck.pulse.confidence')}</span><strong>{normalized}%</strong></p>
            <p><span>{t('traderDeck.pulse.volatility')}</span><strong>{volatility}</strong></p>
            <p><span>{t('traderDeck.pulse.clarity')}</span><strong>{directionalClarity}</strong></p>
            <p><span>{t('traderDeck.pulse.riskTone')}</span><strong>{riskTone}</strong></p>
            <p><span>{t('traderDeck.pulse.posture')}</span><strong>{posture}</strong></p>
          </div>
          <div className="td-mi-pulse-meta">
            {Array.isArray(recommendedAction) && recommendedAction.length > 0 && (
              <>
                <p><strong>{t('traderDeck.pulse.deskContext')}</strong></p>
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
