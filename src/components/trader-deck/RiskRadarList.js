import React from 'react';

const IMPACT_META = {
  high:   { cls: 'rr-impact--high',   label: '●●●', title: 'High Impact' },
  medium: { cls: 'rr-impact--medium', label: '●●○', title: 'Medium Impact' },
  low:    { cls: 'rr-impact--low',    label: '●○○', title: 'Low Impact' },
};

function parseItem(item) {
  if (typeof item === 'string') return { title: item, impact: null, forecast: null, previous: null, time: null, currency: null };
  const rawImpact = item.impact ?? item.severity ?? item.importance ?? '';
  const impact =
    typeof rawImpact === 'number'
      ? (rawImpact >= 3 ? 'high' : rawImpact >= 2 ? 'medium' : rawImpact >= 1 ? 'low' : null)
      : String(rawImpact || '').toLowerCase() || null;
  return {
    title:    item.title || item.event || item.text || item.name || '—',
    impact,
    forecast: item.forecast ?? item.estimate ?? item.fcst ?? null,
    previous: item.previous ?? item.prior ?? null,
    actual: item.actual ?? item.value ?? null,
    time:     item.time || item.datetime || item.date || null,
    currency: item.currency || item.category || null,
  };
}

function formatVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function formatTime(t) {
  if (!t) return null;
  // Handle ISO or time string HH:MM
  try {
    if (/^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
    const d = new Date(t);
    if (!isNaN(d)) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {}
  return t;
}

export default function RiskRadarList({ items = [], riskEngine = null }) {
  if (!items.length) {
    return <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No upcoming events</p>;
  }

  const parsed = items.map(parseItem);
  const hasExtras = parsed.some((r) => r.forecast !== null || r.previous !== null || r.actual !== null || r.impact);

  return (
    <div className="rr-table-wrap">
      {riskEngine && (
        <div className="td-mi-pulse-meta" style={{ marginBottom: 10 }}>
          <p><strong>Market Risk Score:</strong> {Number(riskEngine.score || 0)}/100</p>
          <p><strong>Risk Level:</strong> {riskEngine.level || 'Moderate'}</p>
          {riskEngine.breakdown && (
            <p>
              <strong>Breakdown:</strong>{' '}
              Event Risk {riskEngine.breakdown.eventRisk ?? '—'} ·
              Geopolitical Risk {riskEngine.breakdown.geopoliticalRisk ?? '—'} ·
              Volatility {riskEngine.breakdown.volatility ?? '—'} ·
              Liquidity {riskEngine.breakdown.liquidity ?? '—'} ·
              Clustering {riskEngine.breakdown.clustering ?? '—'}
            </p>
          )}
          {Number.isFinite(riskEngine.nextRiskEventInMins) && (
            <p><strong>Next Risk Event:</strong> in {riskEngine.nextRiskEventInMins} mins</p>
          )}
        </div>
      )}
      <table className="rr-table">
        <thead>
          <tr>
            <th className="rr-th rr-th--time">Time</th>
            <th className="rr-th rr-th--cur">Cur.</th>
            <th className="rr-th rr-th--impact">Impact</th>
            <th className="rr-th rr-th--event">Event</th>
            {hasExtras && <th className="rr-th rr-th--num">Actual</th>}
            {hasExtras && <th className="rr-th rr-th--num">Forecast</th>}
            {hasExtras && <th className="rr-th rr-th--num">Previous</th>}
          </tr>
        </thead>
        <tbody>
          {parsed.map((row, i) => {
            const impMeta = IMPACT_META[row.impact] || null;
            return (
              <tr key={i} className="rr-row">
                <td className="rr-td rr-td--time">{formatTime(row.time) || '—'}</td>
                <td className="rr-td rr-td--cur">{row.currency ? <span className="rr-currency">{row.currency.toUpperCase()}</span> : '—'}</td>
                <td className="rr-td rr-td--impact">
                  {impMeta
                    ? <span className={`rr-impact ${impMeta.cls}`} title={impMeta.title}>{impMeta.label}</span>
                    : <span className="rr-impact rr-impact--none">—</span>}
                </td>
                <td className="rr-td rr-td--event">{row.title}</td>
                {hasExtras && <td className="rr-td rr-td--num rr-actual">{formatVal(row.actual)}</td>}
                {hasExtras && <td className="rr-td rr-td--num rr-forecast">{formatVal(row.forecast)}</td>}
                {hasExtras && <td className="rr-td rr-td--num rr-previous">{formatVal(row.previous)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
