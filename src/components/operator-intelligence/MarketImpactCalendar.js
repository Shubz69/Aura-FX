import React from 'react';
import { FaCalendarAlt } from 'react-icons/fa';

/**
 * @param {{ rows?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketImpactCalendar({ rows, loading }) {
  return (
    <div className="oi-card oi-card--calendar">
      <div className="oi-card__head">
        <FaCalendarAlt className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">Market impact calendar</span>
      </div>
      {loading ? <p className="oi-card__muted">Loading calendar…</p> : null}
      {!loading && (!rows || rows.length === 0) ? (
        <p className="oi-card__muted">No upcoming events.</p>
      ) : null}
      {!loading && rows && rows.length > 0 ? (
        <div className="oi-cal-scroll">
          <table className="oi-cal">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Country</th>
                <th>Event</th>
                <th>Period</th>
                <th>Actual</th>
                <th>Forecast</th>
                <th>Previous</th>
                <th>Impact</th>
                <th>Surprise</th>
                <th>Affected assets</th>
                <th>Expected vol</th>
                <th>Pre-event</th>
                <th>Post-event</th>
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
