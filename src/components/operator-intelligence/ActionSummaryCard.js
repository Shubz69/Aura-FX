import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaCrosshairs } from 'react-icons/fa';

/**
 * @param {{ summary?: Record<string, unknown> | null, loading?: boolean }} props
 */
export default function ActionSummaryCard({ summary, loading }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="oi-card oi-card--action" role="status">
        <div className="oi-card__head">
          <FaCrosshairs className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">{t('operatorIntelligence.actionSummary.title')}</span>
        </div>
        <p className="oi-card__muted">{t('operatorIntelligence.actionSummary.loading')}</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="oi-card oi-card--action" role="status">
        <div className="oi-card__head">
          <FaCrosshairs className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">{t('operatorIntelligence.actionSummary.title')}</span>
        </div>
        <p className="oi-card__muted">{t('operatorIntelligence.actionSummary.unavailable')}</p>
      </div>
    );
  }

  const rows = [
    { k: t('operatorIntelligence.actionSummary.currentRegime'), v: summary.currentRegime },
    { k: t('operatorIntelligence.actionSummary.bestSetupType'), v: summary.bestSetupType },
    { k: t('operatorIntelligence.actionSummary.avoid'), v: summary.avoid },
    { k: t('operatorIntelligence.actionSummary.confirmationNeeded'), v: summary.confirmationNeeded },
    { k: t('operatorIntelligence.actionSummary.riskMode'), v: summary.riskMode },
    { k: t('operatorIntelligence.actionSummary.finalAction'), v: summary.finalAction, highlight: true },
  ];

  return (
    <div className="oi-card oi-card--action">
      <div className="oi-card__head">
        <FaCrosshairs className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">{t('operatorIntelligence.actionSummary.whatToDoNow')}</span>
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
