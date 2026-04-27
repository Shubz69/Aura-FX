import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

function normalizeImpactKey(raw) {
  if (raw == null || raw === '') return 'medium';
  if (typeof raw === 'number') {
    return raw >= 3 ? 'high' : raw >= 2 ? 'medium' : raw >= 1 ? 'low' : 'medium';
  }
  const s = String(raw).trim().toLowerCase();
  if (['high', 'h', '3'].includes(s)) return 'high';
  if (['low', 'l', '1'].includes(s)) return 'low';
  if (['medium', 'm', '2', 'moderate'].includes(s)) return 'medium';
  return 'medium';
}

function parseItem(item) {
  if (typeof item === 'string') {
    return {
      title: item,
      impact: 'medium',
      forecast: null,
      previous: null,
      actual: null,
      time: null,
      currency: 'GLB',
    };
  }
  const rawImpact = item.impact ?? item.severity ?? item.importance ?? '';
  const impact = normalizeImpactKey(
    typeof rawImpact === 'number' ? rawImpact : String(rawImpact || '').trim() || null,
  );
  return {
    title: item.title || item.event || item.text || item.name || '—',
    impact,
    forecast: item.forecast ?? item.estimate ?? item.fcst ?? null,
    previous: item.previous ?? item.prior ?? null,
    actual: item.actual ?? item.value ?? null,
    time: item.time ?? item.datetime ?? item.date ?? null,
    currency: item.currency || item.category || null,
  };
}

function formatTime(t) {
  if (t == null || t === '') return null;
  if (typeof t === 'number' && Number.isFinite(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
  try {
    const s = String(t);
    if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {}
  return String(t);
}

function metric(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function riskLevelTone(level) {
  const s = String(level || '').toLowerCase();
  if (s.includes('extreme') || s.includes('high')) return 'rr-level--high';
  if (s.includes('low')) return 'rr-level--low';
  return 'rr-level--medium';
}

function formatRiskDimension(score, t) {
  if (score == null || score === '') return t('traderDeck.eta.emDash');
  const n = Number(score);
  if (!Number.isFinite(n)) return String(score);
  const rounded = Math.round(n);
  const toneKey = n >= 70 ? 'dimElevated' : n >= 45 ? 'dimModerate' : 'dimContained';
  return `${t(`traderDeck.riskRadar.${toneKey}`)} (${rounded})`;
}

function translateRiskLevelLabel(raw, t) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('high') || s.includes('extreme')) return t('traderDeck.riskRadar.levelHigh');
  if (s.includes('low')) return t('traderDeck.riskRadar.levelLow');
  return t('traderDeck.riskRadar.levelModerate');
}

/**
 * @param {boolean} [summaryOnly] - When true, only show riskEngine summary (no per-event list).
 *   Use on Market Outlook daily where the full Economic Calendar sits below to avoid duplicate “calendars”.
 */
export default function RiskRadarList({ items = [], riskEngine = null, summaryOnly = false, outlookContext = null }) {
  const { t } = useTranslation();
  const hasList = items.length > 0;

  const impactMeta = useMemo(
    () => ({
      high: { cls: 'rr-impact--high', label: '●●●', title: t('traderDeck.riskRadar.impactTitleHigh') },
      medium: { cls: 'rr-impact--medium', label: '●●○', title: t('traderDeck.riskRadar.impactTitleMedium') },
      low: { cls: 'rr-impact--low', label: '●○○', title: t('traderDeck.riskRadar.impactTitleLow') },
    }),
    [t],
  );

  const breakdown = riskEngine?.breakdown || null;
  const riskStats = useMemo(
    () => [
      { id: 'score', label: t('traderDeck.riskRadar.marketRiskScore'), value: Number(riskEngine?.score || 0), isScore: true },
      { id: 'level', label: t('traderDeck.riskRadar.riskLevel'), value: translateRiskLevelLabel(riskEngine?.level, t), isLevel: true },
      { id: 'vol', label: t('traderDeck.riskRadar.volatility'), value: formatRiskDimension(breakdown?.volatility, t) },
      { id: 'liq', label: t('traderDeck.riskRadar.liquidity'), value: formatRiskDimension(breakdown?.liquidity, t) },
      { id: 'cl', label: t('traderDeck.riskRadar.clustering'), value: formatRiskDimension(breakdown?.clustering, t) },
      { id: 'geo', label: t('traderDeck.riskRadar.geoRisk'), value: formatRiskDimension(breakdown?.geopoliticalRisk, t) },
      { id: 'macro', label: t('traderDeck.riskRadar.macroPressure'), value: formatRiskDimension(breakdown?.eventRisk, t) },
    ],
    [t, riskEngine, breakdown],
  );

  const levelClass = riskLevelTone(riskEngine?.level);

  if (!hasList && !riskEngine) {
    return (
      <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
        {t('traderDeck.riskRadar.emptyNoFactors')}
      </p>
    );
  }

  if (summaryOnly && !riskEngine && hasList) {
    return (
      <div className="rr-table-wrap">
        <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.42)', fontSize: '0.82rem' }}>
          {t('traderDeck.riskRadar.scheduledInCal')}
        </p>
      </div>
    );
  }

  const parsed = hasList ? items.map(parseItem).slice(0, 8) : [];

  return (
    <div className="rr-table-wrap">
      {outlookContext && typeof outlookContext === 'object' ? (
        <div className="td-mi-outlook-risk-context" aria-label={t('traderDeck.riskRadar.outlookAria')}>
          <p className="td-mi-outlook-risk-line">
            <span>{t('traderDeck.riskRadar.lblLevel')}</span>
            <strong>
              {translateRiskLevelLabel(outlookContext.currentRiskLevel || riskEngine?.level, t) || t('traderDeck.eta.emDash')}
            </strong>
          </p>
          {outlookContext.volatilityState ? (
            <p className="td-mi-outlook-risk-line">
              <span>{t('traderDeck.riskRadar.volatility')}</span>
              <strong>{outlookContext.volatilityState}</strong>
            </p>
          ) : null}
          {outlookContext.clusteringBehavior ? (
            <p className="td-mi-outlook-risk-line">
              <span>{t('traderDeck.riskRadar.clustering')}</span>
              <strong>{outlookContext.clusteringBehavior}</strong>
            </p>
          ) : null}
          {outlookContext.nextRiskWindow ? (
            <p className="td-mi-outlook-risk-line td-mi-outlook-risk-line--wide">
              <span>{t('traderDeck.riskRadar.lblNextWindow')}</span>
              <strong>{outlookContext.nextRiskWindow}</strong>
            </p>
          ) : null}
          {Array.isArray(outlookContext.upcomingEvents) && outlookContext.upcomingEvents.length > 0 ? (
            <ul className="td-mi-outlook-risk-events">
              {outlookContext.upcomingEvents.map((ev, idx) => (
                <li key={idx}>
                  <span className={`mo-pill mo-pill--impact mo-pill--impact-${ev.impact || 'medium'}`}>{ev.impact || 'med'}</span>
                  {ev.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {riskEngine && (
        <div className="td-mi-pulse-meta td-mi-pulse-meta--risk td-mi-risk-engine-meta">
          <div className="td-mi-risk-engine-stats">
            {riskStats.map((row) => (
              <p key={row.id}>
                <span>{row.label}</span>
                <strong className={row.isLevel ? levelClass : ''}>{row.isScore ? `${row.value}/100` : row.value}</strong>
              </p>
            ))}
          </div>
          {Number.isFinite(riskEngine.nextRiskEventInMins) && (
            <p className="td-mi-risk-engine-next">
              <strong>{t('traderDeck.riskRadar.nextRiskWindow', { m: riskEngine.nextRiskEventInMins })}</strong>
            </p>
          )}
        </div>
      )}
      {summaryOnly && riskEngine && (
        <p className="td-mi-list-empty" style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.38)', fontSize: '0.78rem' }}>
          {t('traderDeck.riskRadar.eventDetailBelow')}
        </p>
      )}
      {!summaryOnly && (
        <div className="rr-risk-list">
          {parsed.map((row, i) => {
            const impMeta = impactMeta[row.impact] || impactMeta.medium;
            const timeLabel = formatTime(row.time);
            const actual = metric(row.actual);
            const forecast = metric(row.forecast);
            const previous = metric(row.previous);
            const hasMetrics = Boolean(actual || forecast || previous);
            const dash = t('traderDeck.eta.emDash');
            return (
              <article key={i} className="rr-risk-item">
                <p className="rr-risk-item-title">{row.title}</p>
                <p className="rr-risk-item-meta">
                  {row.currency ? <span className="rr-currency">{String(row.currency).toUpperCase()}</span> : 'GLB'}
                  {' · '}
                  <span className={`rr-impact ${impMeta.cls}`} title={impMeta.title}>
                    {impMeta.label}
                  </span>
                  {timeLabel ? ` · ${timeLabel}` : ''}
                </p>
                {hasMetrics && (
                  <p className="rr-risk-item-metrics">
                    {t('traderDeck.riskRadar.metricsActual', { v: actual || dash })}
                    {' · '}
                    {t('traderDeck.riskRadar.metricsForecast', { v: forecast || dash })}
                    {' · '}
                    {t('traderDeck.riskRadar.metricsPrevious', { v: previous || dash })}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
