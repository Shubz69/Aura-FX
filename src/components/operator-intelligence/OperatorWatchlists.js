import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaEye } from 'react-icons/fa';
import { getInstrumentByChartSymbol, normalizeSymbol } from '../../data/terminalInstruments';

/**
 * @param {{ watchlists?: { pairs?: unknown[], indices?: unknown[] } | null, loading?: boolean }} props
 */
export default function OperatorWatchlists({ watchlists, loading }) {
  const { t } = useTranslation();
  const displaySymbol = (raw) => {
    const inst = getInstrumentByChartSymbol(String(raw || ''));
    if (inst?.id) return inst.id;
    const normalized = normalizeSymbol(raw);
    return normalized || String(raw || '—');
  };

  return (
    <div className="oi-card oi-card--watch">
      <div className="oi-card__head">
        <FaEye className="oi-card__icon" aria-hidden />
        <span className="oi-card__title">{t('operatorIntelligence.watchlists.title')}</span>
      </div>
      {loading ? <p className="oi-card__muted">{t('operatorIntelligence.watchlists.loading')}</p> : null}
      {!loading && !watchlists ? <p className="oi-card__muted">{t('operatorIntelligence.watchlists.none')}</p> : null}
      {!loading && watchlists ? (
        <div className="oi-watchlists-body" data-testid="oi-watchlists-scroll">
          <p className="oi-metric-label">{t('operatorIntelligence.watchlists.fx')}</p>
          <ul className="oi-watch">
            {(watchlists.pairs || []).map((p) => (
              <li key={p.symbol} className="oi-watch__row">
                <span className="oi-watch__sym">{displaySymbol(p.symbol)}</span>
                <span className={`oi-chip oi-chip--bias-${String(p.bias || '').toLowerCase()}`}>{p.bias}</span>
                <span className="oi-watch__note">{p.note}</span>
              </li>
            ))}
          </ul>
          <p className="oi-metric-label">{t('operatorIntelligence.watchlists.indices')}</p>
          <ul className="oi-watch">
            {(watchlists.indices || []).map((p) => (
              <li key={p.symbol} className="oi-watch__row">
                <span className="oi-watch__sym">{displaySymbol(p.symbol)}</span>
                <span className={`oi-chip oi-chip--bias-${String(p.bias || '').toLowerCase()}`}>{p.bias}</span>
                <span className="oi-watch__note">{p.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
