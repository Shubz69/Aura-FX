import React, { useMemo } from 'react';
import { FaTimes, FaBolt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { resolveCandleIntelligence } from '../../services/operatorIntelligenceAdapter';

/**
 * Slide-over intelligence for a clicked candle.
 * @param {{ open: boolean, onClose: () => void, bar: object | null, symbol: string }} props
 */
export default function CandleIntelligencePanel({ open, onClose, bar, symbol }) {
  const { t } = useTranslation();
  const intel = useMemo(() => {
    if (!open || !bar || !bar.time) return null;
    return resolveCandleIntelligence(bar, { symbol });
  }, [open, bar, symbol]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="oi-drawer__backdrop" aria-label={t('operatorIntelligence.candlePanel.closePanel')} onClick={onClose} />
      <aside className="oi-drawer" role="dialog" aria-modal="true" aria-labelledby="oi-candle-intel-title">
        <header className="oi-drawer__head">
          <div className="oi-drawer__title-row">
            <FaBolt className="oi-drawer__icon" aria-hidden />
            <h2 id="oi-candle-intel-title">{t('operatorIntelligence.candlePanel.title')}</h2>
          </div>
          <button type="button" className="oi-drawer__close" onClick={onClose} aria-label={t('common.close')}>
            <FaTimes />
          </button>
        </header>
        {!bar ? (
          <p className="oi-drawer__muted">{t('operatorIntelligence.candlePanel.noBarSelected')}</p>
        ) : !intel ? (
          <p className="oi-drawer__muted">{t('operatorIntelligence.candlePanel.resolving')}</p>
        ) : (
          <div className="oi-drawer__body">
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.whenDirection')}</h3>
              <p>
                <strong>{intel.candleTime}</strong> — {intel.direction} bar ({intel.sizeLabel}, body/range ~{intel.bodyRangePct}%).
              </p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.likelyDriver')}</h3>
              <p>{intel.likelyDriver}</p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.relatedContext')}</h3>
              <ul>
                {(intel.relatedEvents || []).map((ev) => (
                  <li key={ev}>{ev}</li>
                ))}
              </ul>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.volumeVolatility')}</h3>
              <p>{intel.volumeVolatilityRead}</p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.dxyYieldsRisk')}</h3>
              <p>{intel.correlationRead}</p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.whatItMeans')}</h3>
              <p>{intel.whatItMeans}</p>
            </section>
            <section className="oi-intel-block oi-intel-block--accent">
              <h3>{t('operatorIntelligence.candlePanel.practicalGuidance')}</h3>
              <p>{intel.practicalGuidance}</p>
            </section>
            {intel.exampleBlurb ? (
              <section className="oi-intel-block oi-intel-block--quote">
                <h3>{t('operatorIntelligence.candlePanel.exampleNarrative')}</h3>
                <p>{intel.exampleBlurb}</p>
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
