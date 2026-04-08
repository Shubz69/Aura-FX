import React, { useMemo } from 'react';

/** Lightweight SVGs — matches aa-chart-wrap styling when wrapped by parent */

export function EquityMiniChart({ points, height = 120 }) {
  const { path, minY, maxY } = useMemo(() => {
    if (!points?.length) return { path: '', minY: 0, maxY: 1 };
    const equities = points.map((p) => Number(p.equity) || 0);
    const min = Math.min(...equities);
    const max = Math.max(...equities);
    const pad = Math.max(1e-6, (max - min) * 0.08);
    const y0 = min - pad;
    const y1 = max + pad;
    const w = 600;
    const h = height;
    const n = points.length;
    const d = points
      .map((p, i) => {
        const x = (i / Math.max(1, n - 1)) * w;
        const eq = Number(p.equity) || 0;
        const y = h - ((eq - y0) / (y1 - y0)) * (h - 8) - 4;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
    return { path: d, minY: y0, maxY: y1 };
  }, [points, height]);

  if (!points?.length) {
    return <p className="aa--muted" style={{ fontSize: '0.8rem', margin: 0 }}>Equity curve appears after closed trades.</p>;
  }

  return (
    <svg className="aa-svg-chart" viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="btEqGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(234, 169, 96, 0.35)" />
          <stop offset="100%" stopColor="rgba(234, 169, 96, 0)" />
        </linearGradient>
      </defs>
      <path d={`${path} L 600 ${height} L 0 ${height} Z`} fill="url(#btEqGrad)" opacity={0.5} />
      <path d={path} fill="none" stroke="#eaa960" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DrawdownMiniChart({ points, height = 100 }) {
  const ddPath = useMemo(() => {
    if (!points?.length) return '';
    const equities = points.map((p) => Number(p.equity) || 0);
    let peak = equities[0];
    const dds = equities.map((eq) => {
      if (eq > peak) peak = eq;
      return peak - eq;
    });
    const maxDd = Math.max(...dds, 1e-9);
    const w = 600;
    const h = height;
    return dds
      .map((dd, i) => {
        const x = (i / Math.max(1, dds.length - 1)) * w;
        const y = h - (dd / maxDd) * (h - 6) - 3;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, height]);

  if (!points?.length) return null;

  return (
    <svg className="aa-svg-chart" viewBox={`0 0 600 ${height}`} preserveAspectRatio="none" style={{ height }}>
      <path d={ddPath} fill="none" stroke="rgba(154, 143, 132, 0.9)" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

export function RHistogramBars({ bins, labels, keys }) {
  if (!bins) return null;
  const entries =
    Array.isArray(keys) && keys.length === labels.length
      ? keys.map((k, i) => [labels[i], bins[k] || 0])
      : labels.map((k) => [k, bins[k] || 0]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, paddingTop: 8 }}>
      {entries.map(([label, val], idx) => (
        <div key={`${label}-${idx}`} style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              height: `${(val / max) * 100}%`,
              minHeight: val ? 4 : 0,
              borderRadius: 4,
              background: 'linear-gradient(180deg, rgba(234,169,96,0.5), rgba(234,169,96,0.12))',
            }}
          />
          <div className="aa--dim" style={{ fontSize: '0.58rem', marginTop: 4 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarHeatmapMini({ calendarMap }) {
  const entries = Object.entries(calendarMap || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    return <p className="aa--muted" style={{ fontSize: '0.8rem' }}>No daily PnL yet.</p>;
  }
  const vals = entries.map(([, v]) => Number(v));
  const maxAbs = Math.max(1e-9, ...vals.map((x) => Math.abs(x)));
  const last = entries.slice(-56);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {last.map(([day, pnl]) => {
        const p = Number(pnl);
        const intensity = Math.min(1, Math.abs(p) / maxAbs);
        const bg =
          p > 1e-8
            ? `rgba(234, 169, 96, ${0.15 + intensity * 0.55})`
            : p < -1e-8
              ? `rgba(154, 143, 132, ${0.12 + intensity * 0.45})`
              : 'rgba(255,255,255,0.04)';
        return (
          <div
            key={day}
            title={`${day}: ${p.toFixed(2)}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: bg,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        );
      })}
    </div>
  );
}
