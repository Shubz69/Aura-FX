import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaCalendarAlt } from 'react-icons/fa';

/**
 * @param {{ rows?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketImpactCalendar({ rows, loading }) {
  const { t } = useTranslation();
  return (
    <div className="oi-card oi-card--calendar">
      <div className="oi-card__head">
        <FaCalendarAlt className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">{t('operatorIntelligence.calendar.title')}</span>
      </div>
      {loading ? <p className="oi-card__muted">{t('operatorIntelligence.calendar.loading')}</p> : null}
      {!loading && (!rows || rows.length === 0) ? (
        <p className="oi-card__muted">{t('operatorIntelligence.calendar.noUpcoming')}</p>
      ) : null}
      {!loading && rows && rows.length > 0 ? (
        <div className="oi-cal-scroll">
          <table className="oi-cal">
            <thead>
              <tr>
                <th>{t('operatorIntelligence.calendar.timeUtc')}</th>
                <th>{t('operatorIntelligence.calendar.country')}</th>
                <th>{t('operatorIntelligence.calendar.event')}</th>
                <th>{t('operatorIntelligence.calendar.period')}</th>
                <th>{t('operatorIntelligence.calendar.actual')}</th>
                <th>{t('operatorIntelligence.calendar.forecast')}</th>
                <th>{t('operatorIntelligence.calendar.previous')}</th>
                <th>{t('operatorIntelligence.calendar.impact')}</th>
                <th>{t('operatorIntelligence.calendar.surprise')}</th>
                <th>{t('operatorIntelligence.calendar.affectedAssets')}</th>
                <th>{t('operatorIntelligence.calendar.expectedVol')}</th>
                <th>{t('operatorIntelligence.calendar.preEvent')}</th>
                <th>{t('operatorIntelligence.calendar.postEvent')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.timeUtc}</td>
                  <td>{r.country}</td>
                  <td>{r.event}</td>
                  <td>{r.period}</td>
                  <td>{r.actual}</td>
                  <td>{r.forecast}</td>
                  <td>{r.previous}</td>
                  <td>{r.impact}</td>
                  <td>{r.surprise}</td>
                  <td>{(r.affectedAssets || []).join(', ')}</td>
                  <td>{r.expectedVolatility}</td>
                  <td className="oi-cal-guidance">{r.preEventGuidance}</td>
                  <td className="oi-cal-guidance">{r.postEventGuidance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
