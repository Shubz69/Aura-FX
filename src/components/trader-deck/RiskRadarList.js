import React from 'react';

const IMPACT_META = {
  high:   { cls: 'rr-impact--high',   label: '●●●', title: 'High Impact' },
  medium: { cls: 'rr-impact--medium', label: '●●○', title: 'Medium Impact' },
  low:    { cls: 'rr-impact--low',    label: '●○○', title: 'Low Impact' },
};

function parseItem(item) {
  if (typeof item === 'string') return { title: item, impact: null, forecast: null, previous: null, time: null, currency: null };
  return {
    title:    item.title || item.text || item.name || '—',
    impact:   (item.impact || item.severity || '').toLowerCase() || null,
    forecast: item.forecast ?? item.estimate ?? null,
    previous: item.previous ?? item.prior ?? null,
    time:     item.time || item.date || null,
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

export default function RiskRadarList({ items = [] }) {
  if (!items.length) {
    return <p className="td-mi-list-empty" style={{ padding: '12px 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No upcoming events</p>;
  }

  const parsed = items.map(parseItem);
  const hasExtras = parsed.some((r) => r.forecast !== null || r.previous !== null || r.impact);

  return (
    <div className="rr-table-wrap">
      <table className="rr-table">
        <thead>
          <tr>
            <th className="rr-th rr-th--time">Time</th>
            <th className="rr-th rr-th--cur">Cur.</th>
            <th className="rr-th rr-th--impact">Impact</th>
            <th className="rr-th rr-th--event">Event</th>
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
