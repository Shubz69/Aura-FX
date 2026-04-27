import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowIcon } from './MarketPulseGauge';

function impactLabel(impact, t) {
  const dash = t('traderDeck.eta.emDash');
  if (!impact) return dash;
  const s = String(impact).toLowerCase();
  if (s === 'high') return t('traderDeck.driver.impactHigh');
  if (s === 'medium') return t('traderDeck.driver.impactMedium');
  if (s === 'low') return t('traderDeck.driver.impactLow');
  return t('traderDeck.driver.impactGeneric', { impact: String(impact) });
}

export default function DriverList({ drivers = [] }) {
  const { t } = useTranslation();
  const dash = t('traderDeck.eta.emDash');
  if (!drivers.length) {
    return (
      <ul className="td-mi-list td-mi-list--drivers">
        <li className="td-mi-list-empty">{t('traderDeck.driver.empty')}</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-list td-mi-list--drivers td-mi-list--drivers-dense">
      {drivers.map((d, i) => {
        const assets = Array.isArray(d.affectedAssets) ? d.affectedAssets : [];
        const explain = d.explanation || d.effect || '';
        return (
          <li key={i} className="td-mi-list-item td-mi-list-item--driver-dense">
            <div className="td-mi-list-item__row">
              <ArrowIcon direction={d.direction || 'neutral'} />
              <span className="td-mi-list-main"><strong>{d.name || d.title || dash}</strong></span>
              <span className="td-mi-list-meta">
                {impactLabel(d.impact, t)}
              </span>
            </div>
            {explain ? (
              <p className="td-mi-list-detail">{explain}</p>
            ) : null}
            {assets.length > 0 ? (
              <div className="td-mi-asset-chips" aria-label={t('traderDeck.driver.affectedAssetsAria')}>
                {assets.slice(0, 6).map((a) => (
                  <span key={a} className="td-mi-asset-chip">{a}</span>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
