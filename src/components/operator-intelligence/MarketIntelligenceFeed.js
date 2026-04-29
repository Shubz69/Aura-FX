import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaNewspaper } from 'react-icons/fa';

function impactClass(impact) {
  const i = String(impact || '').toLowerCase();
  if (i.includes('high')) return 'oi-impact--high';
  if (i.includes('med')) return 'oi-impact--med';
  return 'oi-impact--low';
}

/**
 * @param {{ items?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketIntelligenceFeed({ items, loading }) {
  const { t } = useTranslation();
  return (
    <div className="oi-card oi-card--feed">
      <div className="oi-card__head">
        <FaNewspaper className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">{t('operatorIntelligence.feed.title')}</span>
      </div>
      <p className="oi-feed-sub">{t('operatorIntelligence.feed.subtitle')}</p>
      {loading ? <p className="oi-card__muted">{t('operatorIntelligence.feed.loading')}</p> : null}
      {!loading && (!items || items.length === 0) ? (
        <p className="oi-card__muted">{t('operatorIntelligence.feed.none')}</p>
      ) : null}
      {!loading && items && items.length > 0 ? (
        <ul className="oi-feed">
          {items.map((row) => (
            <li key={row.id} className="oi-feed-item">
              <div className="oi-feed-item__meta">
                <time dateTime={row.ts}>{row.ts}</time>
                <span className="oi-feed-cat">{row.category}</span>
                <span className={`oi-impact-pill ${impactClass(row.impact)}`}>{row.impact}</span>
              </div>
              <h3 className="oi-feed-headline">{row.headline}</h3>
              <div className="oi-feed-assets">
                <span className="oi-metric-label">{t('operatorIntelligence.feed.affectedAssets')}</span>
                <span>{(row.affectedAssets || []).join(', ')}</span>
              </div>
              <section>
                <span className="oi-metric-label">{t('operatorIntelligence.feed.aiSummary')}</span>
                <p>{row.aiSummary}</p>
              </section>
              <section>
                <span className="oi-metric-label">{t('operatorIntelligence.feed.whyItMatters')}</span>
                <p>{row.whyItMatters}</p>
              </section>
              <section className="oi-feed-action">
                <span className="oi-metric-label">{t('operatorIntelligence.feed.suggestedAction')}</span>
                <p>{row.action}</p>
              </section>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
