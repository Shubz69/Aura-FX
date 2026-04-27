import React from 'react';
import { FaGlobe } from 'react-icons/fa';

function dirClass(dir) {
  const d = String(dir || '').toLowerCase();
  if (d === 'up') return 'oi-dir--up';
  if (d === 'down') return 'oi-dir--down';
  return 'oi-dir--flat';
}

/**
 * @param {{ drivers?: Array<Record<string, unknown>> | null, loading?: boolean }} props
 */
export default function MarketDriversPanel({ drivers, loading }) {
  return (
    <div className="oi-card">
      <div className="oi-card__head">
        <FaGlobe className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">Market drivers</span>
      </div>
      {loading ? <p className="oi-card__muted">Loading drivers…</p> : null}
      {!loading && (!drivers || drivers.length === 0) ? (
        <p className="oi-card__muted">No driver data.</p>
      ) : null}
      {!loading && drivers && drivers.length > 0 ? (
        <ul className="oi-drivers">
          {drivers.map((d) => (
            <li key={d.id} className="oi-driver">
              <div className="oi-driver__top">
                <span className="oi-driver__label">{d.label}</span>
                <span className={`oi-driver__chg ${dirClass(d.direction)}`}>{d.change}</span>
              </div>
              <div className="oi-driver__mid">
                <span className="oi-driver__val">{d.value}</span>
              </div>
              <p className="oi-driver__interp">{d.interpretation}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
