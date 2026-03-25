/**
 * Premium empty / connect states for Aura Analysis dashboard tabs.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/aura-analysis/AuraShared.css';

/**
 * @param {'connect' | 'data'} variant
 *   connect — no platform / account; primary CTA to Connection Hub
 *   data    — connected but no trades in range; softer messaging
 */
export default function AuraAnalysisEmptyState({
  icon = 'fa-plug',
  title,
  description,
  variant = 'connect',
}) {
  const isConnect = variant === 'connect';

  return (
    <div className={`aa-empty-state${isConnect ? ' aa-empty-state--connect' : ' aa-empty-state--data'}`}>
      <div className="aa-empty-state-card">
        <div className="aa-empty-state-card-inner">
          <div className="aa-empty-state-icon-wrap" aria-hidden="true">
            <i className={`fas ${icon}`} />
          </div>
          <h2 className="aa-empty-state-title">{title}</h2>
          <p className="aa-empty-state-desc">{description}</p>
          {isConnect ? (
            <>
              <Link to="/aura-analysis/ai" className="aa-empty-state-cta">
                Connect MT5 account
              </Link>
              <ul className="aa-empty-state-benefits">
                <li>Live balance, equity, and margin</li>
                <li>Performance, risk, and edge analytics</li>
                <li>Session, direction, and symbol breakdowns</li>
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
