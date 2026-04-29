import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="oi-card oi-card--bias" role="status">
        <div className="oi-card__head">
          <span className="oi-card__title">{t('operatorIntelligence.biasEngine.title')}</span>
        </div>
        <p className="oi-card__muted">{t('operatorIntelligence.biasEngine.loading')}</p>
      </div>
    );
  }
  if (!bias) {
    return (
      <div className="oi-card oi-card--bias" role="status">
        <div className="oi-card__head">
          <span className="oi-card__title">{t('operatorIntelligence.biasEngine.title')}</span>
        </div>
        <p className="oi-card__muted">{t('operatorIntelligence.biasEngine.unavailable')}</p>
      </div>
    );
  }

  return (
    <div className="oi-card oi-card--bias">
      <div className="oi-card__head">
        <span className="oi-card__title">{t('operatorIntelligence.biasEngine.title')}</span>
        <span className={`oi-chip oi-chip--bias-${String(bias.biasLabel || 'neutral').toLowerCase()}`}>
          {bias.biasLabel}
        </span>
      </div>
      <div className="oi-bias-breakdown">
        <p className="oi-bias-kicker">{t('operatorIntelligence.biasEngine.breakdown')}</p>
        {scoreBar(t('operatorIntelligence.biasEngine.directional'), bias.directionalScore)}
        {scoreBar(t('operatorIntelligence.biasEngine.technical'), bias.technicalScore)}
        {scoreBar(t('operatorIntelligence.biasEngine.fundamental'), bias.fundamentalScore)}
        {scoreBar(t('operatorIntelligence.biasEngine.sentiment'), bias.sentimentScore)}
        {scoreBar(t('operatorIntelligence.biasEngine.flow'), bias.flowScore)}
        {scoreBar(t('operatorIntelligence.biasEngine.positioning'), bias.positioningScore)}
      </div>
      <div className="oi-bias-footer">
        <div>
          <span className="oi-metric-label">{t('operatorIntelligence.biasEngine.overallConviction')}</span>
          <span className="oi-metric-value oi-metric-value--gold">{bias.overallConvictionPct}%</span>
        </div>
        <div className="oi-bias-guidance">
          <span className="oi-metric-label">{t('operatorIntelligence.biasEngine.executionGuidance')}</span>
          <p>{bias.executionGuidance}</p>
        </div>
      </div>
    </div>
  );
}
