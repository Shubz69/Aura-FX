import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Top Aura Pulse strip — compresses regime + driver + action.
 * @param {{ pulse?: Record<string, unknown> | null, loading?: boolean }} props
 */
export default function AuraPulseBar({ pulse, loading }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="oi-pulse oi-pulse--loading" role="status" aria-live="polite">
        <span className="oi-pulse__loading">{t('operatorIntelligence.pulse.loading')}</span>
      </div>
    );
  }
  if (!pulse) {
    return (
      <div className="oi-pulse oi-pulse--empty" role="status">
        <span className="oi-pulse__loading">{t('operatorIntelligence.pulse.unavailable')}</span>
      </div>
    );
  }

  const items = [
    { k: t('operatorIntelligence.pulse.marketState'), v: pulse.marketState },
    { k: t('operatorIntelligence.pulse.bias'), v: pulse.bias },
    { k: t('operatorIntelligence.pulse.volatility'), v: pulse.volatility },
    { k: t('operatorIntelligence.pulse.structure'), v: pulse.structure },
    { k: t('operatorIntelligence.pulse.conviction'), v: `${pulse.convictionPct}%` },
    { k: t('operatorIntelligence.pulse.keyDriver'), v: pulse.keyDriver, wide: true },
    { k: t('operatorIntelligence.pulse.recommendedAction'), v: pulse.recommendedAction, wide: true, accent: true },
  ];

  return (
    <div className="oi-pulse" role="region" aria-label={t('operatorIntelligence.pulse.ariaLabel')}>
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
