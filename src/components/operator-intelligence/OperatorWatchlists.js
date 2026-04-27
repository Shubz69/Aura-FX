import React from 'react';
import { FaEye } from 'react-icons/fa';

/**
 * @param {{ watchlists?: { pairs?: unknown[], indices?: unknown[] } | null, loading?: boolean }} props
 */
export default function OperatorWatchlists({ watchlists, loading }) {
  return (
    <div className="oi-card oi-card--watch">
      <div className="oi-card__head">
        <FaEye className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">Watchlists</span>
      </div>
      {loading ? <p className="oi-card__muted">Loading watchlists…</p> : null}
      {!loading && !watchlists ? <p className="oi-card__muted">No watchlist data.</p> : null}
      {!loading && watchlists ? (
        <>
          <p className="oi-metric-label">FX</p>
          <ul className="oi-watch">
            {(watchlists.pairs || []).map((p) => (
              <li key={p.symbol} className="oi-watch__row">
                <span className="oi-watch__sym">{p.symbol}</span>
                <span className={`oi-chip oi-chip--bias-${String(p.bias || '').toLowerCase()}`}>{p.bias}</span>
                <span className="oi-watch__note">{p.note}</span>
              </li>
            ))}
          </ul>
          <p className="oi-metric-label">Indices</p>
          <ul className="oi-watch">
            {(watchlists.indices || []).map((p) => (
              <li key={p.symbol} className="oi-watch__row">
                <span className="oi-watch__sym">{p.symbol}</span>
                <span className={`oi-chip oi-chip--bias-${String(p.bias || '').toLowerCase()}`}>{p.bias}</span>
                <span className="oi-watch__note">{p.note}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
