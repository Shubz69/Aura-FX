import React from 'react';
import { ArrowIcon } from './MarketPulseGauge';

function impactLabel(impact) {
  if (!impact) return '—';
  const s = String(impact).toLowerCase();
  if (s === 'high') return 'High Impact';
  if (s === 'medium') return 'Medium Impact';
  if (s === 'low') return 'Low Impact';
  return `${impact} Impact`;
}

export default function DriverList({ drivers = [] }) {
  if (!drivers.length) {
    return (
      <ul className="td-mi-list td-mi-list--drivers">
        <li className="td-mi-list-empty">No driver data</li>
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
              <span className="td-mi-list-main"><strong>{d.name || d.title || '—'}</strong></span>
              <span className="td-mi-list-meta">
                {impactLabel(d.impact)}
              </span>
            </div>
            {explain ? (
              <p className="td-mi-list-detail">{explain}</p>
            ) : null}
            {assets.length > 0 ? (
              <div className="td-mi-asset-chips" aria-label="Affected assets">
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
