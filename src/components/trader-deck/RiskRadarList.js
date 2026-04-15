import React from 'react';

const IMPACT_META = {
  high:   { cls: 'rr-impact--high',   label: '●●●', title: 'High Impact' },
  medium: { cls: 'rr-impact--medium', label: '●●○', title: 'Medium Impact' },
  low:    { cls: 'rr-impact--low',    label: '●○○', title: 'Low Impact' },
};

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
    title:    item.title || item.event || item.text || item.name || '—',
    impact,
    forecast: item.forecast ?? item.estimate ?? item.fcst ?? null,
    previous: item.previous ?? item.prior ?? null,
    actual: item.actual ?? item.value ?? null,
    time:     item.time ?? item.datetime ?? item.date ?? null,
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

/** Human-readable label for 0–100 risk sub-scores from the intelligence engine. */
function formatRiskDimension(score) {
  if (score == null || score === '') return '—';
  const n = Number(score);
  if (!Number.isFinite(n)) return String(score);
  const rounded = Math.round(n);
  const tone = n >= 70 ? 'Elevated' : n >= 45 ? 'Moderate' : 'Contained';
  return `${tone} (${rounded})`;
}

/**
 * @param {boolean} [summaryOnly] - When true, only show riskEngine summary (no per-event list).
 *   Use on Market Outlook daily where the full Economic Calendar sits below to avoid duplicate “calendars”.
 */
export default function RiskRadarList({ items = [], riskEngine = null, summaryOnly = false, outlookContext = null }) {
  const hasList = items.length > 0;
  if (!hasList && !riskEngine) {
    return <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No market risk factors available.</p>;
  }

  if (summaryOnly && !riskEngine && hasList) {
    return (
      <div className="rr-table-wrap">
        <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.42)', fontSize: '0.82rem' }}>
          Scheduled releases are listed in the Economic Calendar below.
        </p>
      </div>
    );
  }

  const parsed = hasList ? items.map(parseItem).slice(0, 8) : [];
  const breakdown = riskEngine?.breakdown || null;
  const levelClass = riskLevelTone(riskEngine?.level);
  const riskStats = [
    ['Market Risk Score', Number(riskEngine?.score || 0)],
    ['Risk Level', riskEngine?.level || 'Moderate'],
    ['Volatility', formatRiskDimension(breakdown?.volatility)],
    ['Liquidity', formatRiskDimension(breakdown?.liquidity)],
    ['Clustering', formatRiskDimension(breakdown?.clustering)],
    ['Geo Risk', formatRiskDimension(breakdown?.geopoliticalRisk)],
    ['Macro Pressure', formatRiskDimension(breakdown?.eventRisk)],
  ];

  return (
    <div className="rr-table-wrap">
      {outlookContext && typeof outlookContext === 'object' ? (
        <div className="td-mi-outlook-risk-context" aria-label="Risk outlook context">
          <p className="td-mi-outlook-risk-line">
            <span>Level</span>
            <strong>{outlookContext.currentRiskLevel || riskEngine?.level || '—'}</strong>
          </p>
          {outlookContext.volatilityState ? (
            <p className="td-mi-outlook-risk-line"><span>Volatility</span><strong>{outlookContext.volatilityState}</strong></p>
          ) : null}
          {outlookContext.clusteringBehavior ? (
            <p className="td-mi-outlook-risk-line"><span>Clustering</span><strong>{outlookContext.clusteringBehavior}</strong></p>
          ) : null}
          {outlookContext.nextRiskWindow ? (
            <p className="td-mi-outlook-risk-line td-mi-outlook-risk-line--wide"><span>Next window</span><strong>{outlookContext.nextRiskWindow}</strong></p>
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
            {riskStats.map(([k, v]) => (
              <p key={k}>
                <span>{k}</span>
                <strong className={k === 'Risk Level' ? levelClass : ''}>
                  {k === 'Market Risk Score' ? `${v}/100` : v}
                </strong>
              </p>
            ))}
          </div>
          {Number.isFinite(riskEngine.nextRiskEventInMins) && (
            <p className="td-mi-risk-engine-next"><strong>Next Risk Window:</strong> in {riskEngine.nextRiskEventInMins} mins</p>
          )}
        </div>
      )}
      {summaryOnly && riskEngine && (
        <p className="td-mi-list-empty" style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.38)', fontSize: '0.78rem' }}>
          Event detail is in the Economic Calendar below.
        </p>
      )}
      {!summaryOnly && (
        <div className="rr-risk-list">
          {parsed.map((row, i) => {
            const impMeta = IMPACT_META[row.impact] || IMPACT_META.medium;
            const timeLabel = formatTime(row.time);
            const actual = metric(row.actual);
            const forecast = metric(row.forecast);
            const previous = metric(row.previous);
            const hasMetrics = Boolean(actual || forecast || previous);
            return (
              <article key={i} className="rr-risk-item">
                <p className="rr-risk-item-title">{row.title}</p>
                <p className="rr-risk-item-meta">
                  {row.currency ? <span className="rr-currency">{String(row.currency).toUpperCase()}</span> : 'GLB'}
                  {' · '}
                  <span className={`rr-impact ${impMeta.cls}`} title={impMeta.title}>{impMeta.label}</span>
                  {timeLabel ? ` · ${timeLabel}` : ''}
                </p>
                {hasMetrics && (
                  <p className="rr-risk-item-metrics">
                    {actual ? `Actual: ${actual}` : 'Actual: —'} · {forecast ? `Forecast: ${forecast}` : 'Forecast: —'} · {previous ? `Previous: ${previous}` : 'Previous: —'}
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
