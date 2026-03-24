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

function formatVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
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

export default function RiskRadarList({ items = [], riskEngine = null }) {
  if (!items.length) {
    return <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No upcoming events</p>;
  }

  const parsed = items.map(parseItem);

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
            <th className="rr-th rr-th--num">Actual</th>
            <th className="rr-th rr-th--num">Forecast</th>
            <th className="rr-th rr-th--num">Previous</th>
          </tr>
        </thead>
        <tbody>
          {parsed.map((row, i) => {
            const impMeta = IMPACT_META[row.impact] || IMPACT_META.medium;
            return (
              <tr key={i} className="rr-row">
                <td className="rr-td rr-td--time">{formatTime(row.time) || '—'}</td>
                <td className="rr-td rr-td--cur">
                  {row.currency ? <span className="rr-currency">{String(row.currency).toUpperCase()}</span> : '—'}
                </td>
                <td className="rr-td rr-td--impact">
                  <span className={`rr-impact ${impMeta.cls}`} title={impMeta.title}>{impMeta.label}</span>
                </td>
                <td className="rr-td rr-td--event">{row.title}</td>
                <td className="rr-td rr-td--num rr-actual">{formatVal(row.actual)}</td>
                <td className="rr-td rr-td--num rr-forecast">{formatVal(row.forecast)}</td>
                <td className="rr-td rr-td--num rr-previous">{formatVal(row.previous)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
