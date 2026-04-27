import React from 'react';
import { FaCrosshairs } from 'react-icons/fa';

/**
 * @param {{ summary?: Record<string, unknown> | null, loading?: boolean }} props
 */
export default function ActionSummaryCard({ summary, loading }) {
  if (loading) {
    return (
      <div className="oi-card oi-card--action" role="status">
        <div className="oi-card__head">
          <FaCrosshairs className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">Action summary</span>
        </div>
        <p className="oi-card__muted">Loading summary…</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="oi-card oi-card--action" role="status">
        <div className="oi-card__head">
          <FaCrosshairs className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">Action summary</span>
        </div>
        <p className="oi-card__muted">Summary unavailable.</p>
      </div>
    );
  }

  const rows = [
    { k: 'Current regime', v: summary.currentRegime },
    { k: 'Best setup type', v: summary.bestSetupType },
    { k: 'Avoid', v: summary.avoid },
    { k: 'Confirmation needed', v: summary.confirmationNeeded },
    { k: 'Risk mode', v: summary.riskMode },
    { k: 'Final action', v: summary.finalAction, highlight: true },
  ];

  return (
    <div className="oi-card oi-card--action">
      <div className="oi-card__head">
        <FaCrosshairs className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">What to do now</span>
      </div>
      <ul className="oi-action-list">
        {rows.map((r) => (
          <li key={r.k} className={r.highlight ? 'oi-action-list__li--final' : ''}>
            <span className="oi-action-k">{r.k}</span>
            <span className="oi-action-v">{r.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
