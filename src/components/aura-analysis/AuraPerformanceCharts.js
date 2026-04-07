import React, { useMemo, useId } from 'react';
import '../../styles/aura-analysis/AuraPerformanceCharts.css';

/**
 * Rich equity / drawdown / distribution visuals for Aura Analysis tabs.
 * Same layout hooks (aa-chart-wrap) as legacy charts; upgraded path rendering + grid.
 */

function fmtAxisMoney(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toString();
}

/** Closed-trade sequential equity curve (balance points). */
export function AuraEquityAreaChart({ curve, height = 160, title = 'Equity curve' }) {
  const gid = useId().replace(/:/g, '');
  if (!curve || curve.length < 2) {
    return (
      <div className="aa-chart-wrap">
        {title && <div className="aa-chart-title">{title}</div>}
        <div className="apc-empty" style={{ height }}>No equity data yet</div>
      </div>
    );
  }

  const W = 640;
  const H = height;
  const pad = { t: 18, b: 28, l: 52, r: 14 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const vals = curve.map(p => p.balance);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const range = mx - mn || 1;
  const isUp = vals[vals.length - 1] >= vals[0];
  const stroke = isUp ? '#f8c37d' : '#b8a898';
  const n = curve.length;

  const xs = curve.map((_, i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW));
  const ys = vals.map(v => pad.t + (1 - (v - mn) / range) * innerH);

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${pad.t + innerH} L${xs[0].toFixed(1)},${pad.t + innerH} Z`;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(r => pad.t + r * innerH);
  const yLabels = [1, 0.75, 0.5, 0.25, 0].map(r => mn + (1 - r) * range);

  return (
    <div className="aa-chart-wrap apc-chart">
      {title && <div className="aa-chart-title">{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="apc-svg" style={{ height }}>
        <defs>
          <linearGradient id={`apc-eq-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="55%" stopColor={stroke} stopOpacity="0.08" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <filter id={`apc-glow-${gid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {gridYs.map((gy, i) => (
          <g key={i}>
            <line x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} className="apc-grid-line" />
            <text x={pad.l - 8} y={gy + 4} textAnchor="end" className="apc-axis-lbl">{fmtAxisMoney(yLabels[i])}</text>
          </g>
        ))}
        <path d={areaPath} fill={`url(#apc-eq-${gid})`} className="apc-area" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" filter={`url(#apc-glow-${gid})`} />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4" fill={stroke} className="apc-dot" />
        <text x={pad.l} y={H - 6} className="apc-legend">Synthetic curve from closed P/L order</text>
      </svg>
    </div>
  );
}

/** Underwater / drawdown % curve */
export function AuraDrawdownAreaChart({ curve, height = 100, title = 'Drawdown %' }) {
  const gid = useId().replace(/:/g, '');
  if (!curve || curve.length < 2) return null;

  const W = 640;
  const H = height;
  const pad = { t: 12, b: 22, l: 44, r: 12 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const vals = curve.map(p => p.ddPct);
  const mx = Math.max(...vals, 0.05);
  const n = curve.length;
  const xs = curve.map((_, i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW));
  const ys = vals.map(v => pad.t + (v / mx) * innerH);
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${pad.t + innerH} L${xs[0].toFixed(1)},${pad.t + innerH} Z`;
  const gridSteps = [0, 0.5, 1].map(r => pad.t + r * innerH);

  return (
    <div className="aa-chart-wrap apc-chart apc-chart--dd">
      {title && <div className="aa-chart-title">{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="apc-svg" style={{ height }}>
        <defs>
          <linearGradient id={`apc-dd-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c49b7c" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#c49b7c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridSteps.map((gy, i) => (
          <g key={i}>
            <line x1={pad.l} y1={gy} x2={W - pad.r} y2={gy} className="apc-grid-line apc-grid-line--muted" />
            <text x={pad.l - 6} y={gy + 3} textAnchor="end" className="apc-axis-lbl">
              {i === 0 ? '0' : `${(mx * (i / 2)).toFixed(1)}%`}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={`url(#apc-dd-${gid})`} />
        <path d={linePath} fill="none" stroke="#c49b7c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** UTC hour-of-day contribution (0–23). */
export function AuraHourOfDayStrip({ byHourUtc, emptyHint = 'No time distribution' }) {
  const active = useMemo(
    () => (byHourUtc || []).filter(h => h.trades > 0),
    [byHourUtc]
  );
  const maxAbs = useMemo(
    () => Math.max(...(byHourUtc || []).map(h => Math.abs(h.pnl)), 1),
    [byHourUtc]
  );

  if (!byHourUtc || !byHourUtc.length) {
    return <div className="apc-empty apc-empty--sm">{emptyHint}</div>;
  }

  return (
    <div className="apc-hour-strip" role="img" aria-label="P/L by hour UTC">
      <div className="apc-hour-strip__label">UTC hour → darker = larger | green bias = net positive hour</div>
      <div className="apc-hour-cells">
        {byHourUtc.map(h => {
          const int = maxAbs > 0 ? Math.abs(h.pnl) / maxAbs : 0;
          const hue = h.pnl >= 0 ? 'pos' : 'neg';
          const has = h.trades > 0;
          const title = `UTC ${h.hour}:00 — ${h.trades} trades, ${h.pnl >= 0 ? '+' : ''}${h.pnl.toFixed(2)}, ${h.winRate.toFixed(0)}% WR`;
          return (
            <div
              key={h.hour}
              className={`apc-hour-cell apc-hour-cell--${hue} ${has ? 'apc-hour-cell--on' : ''}`}
              style={{ opacity: has ? 0.35 + int * 0.65 : 0.12 }}
              title={title}
            >
              <span className="apc-hour-num">{h.hour}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Histogram from analytics.pnlHistogram */
export function AuraPnlHistogram({ bins, height = 120 }) {
  if (!bins || !bins.length) {
    return <div className="apc-empty apc-empty--sm">Not enough trades for a distribution</div>;
  }
  const maxCount = Math.max(...bins.map(b => b.count), 1);
  const W = 640;
  const H = height;
  const pad = { t: 12, b: 28, l: 10, r: 10 };
  const barAreaW = W - pad.l - pad.r;
  const barAreaH = H - pad.t - pad.b;
  const bw = barAreaW / bins.length - 2;
  return (
    <div className="apc-histo-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="apc-svg" style={{ height }}>
        {bins.map((b, i) => {
          const h = (b.count / maxCount) * barAreaH;
          const x = pad.l + i * (barAreaW / bins.length) + 1;
          const y = pad.t + barAreaH - h;
          const netPos = b.pnlSum >= 0;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={Math.max(2, bw)}
                height={Math.max(h, 1)}
                rx={2}
                className={`apc-histo-bar ${netPos ? 'apc-histo-bar--pos' : 'apc-histo-bar--neg'}`}
              />
              {b.count > 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="apc-histo-lbl">
                  {b.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="apc-histo-cap">Trade P/L distribution (count per bucket)</div>
    </div>
  );
}
