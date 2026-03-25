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

export default function RiskRadarList({ items = [], riskEngine = null }) {
  if (!items.length) {
    return <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No market risk factors available.</p>;
  }

  const parsed = items.map(parseItem).slice(0, 8);
  const breakdown = riskEngine?.breakdown || null;
  const levelClass = riskLevelTone(riskEngine?.level);

  return (
    <div className="rr-table-wrap">
      {riskEngine && (
        <div className="td-mi-pulse-meta" style={{ marginBottom: 12 }}>
          <p><strong>Market Risk Score:</strong> {Number(riskEngine.score || 0)}/100</p>
          <p><strong>Risk Level:</strong> <span className={levelClass}>{riskEngine.level || 'Moderate'}</span></p>
          {breakdown && (
            <p>
              <strong>Risk Pillars:</strong>{' '}
              Event {breakdown.eventRisk ?? '—'} ·
              Geopolitical {breakdown.geopoliticalRisk ?? '—'} ·
              Volatility {breakdown.volatility ?? '—'} ·
              Liquidity {breakdown.liquidity ?? '—'} ·
              Clustering {breakdown.clustering ?? '—'}
            </p>
          )}
          {Number.isFinite(riskEngine.nextRiskEventInMins) && (
            <p><strong>Next Risk Window:</strong> in {riskEngine.nextRiskEventInMins} mins</p>
          )}
        </div>
      )}
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
    </div>
  );
}
