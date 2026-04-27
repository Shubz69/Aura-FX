import React from 'react';
import { FaChartBar } from 'react-icons/fa';

/**
 * @param {{ rows?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketWatchPanel({ rows, loading }) {
  return (
    <div className="oi-card oi-card--mwatch">
      <div className="oi-card__head">
        <FaChartBar className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">Market watch</span>
      </div>
      {loading ? <p className="oi-card__muted">Loading watch…</p> : null}
      {!loading && (!rows || rows.length === 0) ? <p className="oi-card__muted">No rows.</p> : null}
      {!loading && rows && rows.length > 0 ? (
        <ul className="oi-mwatch">
          {rows.map((r) => (
            <li key={r.symbol} className="oi-mwatch__row">
              <span className="oi-mwatch__sym">{r.symbol}</span>
              <span className="oi-mwatch__bx">
                <span className="oi-mwatch__side">Bid {r.bid}</span>
                <span className="oi-mwatch__side">Ask {r.ask}</span>
              </span>
              <span className="oi-mwatch__spr">Spr {r.spread}</span>
              <span className="oi-mwatch__note">{r.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
