/**
 * Aura Analysis — Overview tab (Image 2 redesign, fully interactive)
 * Three-column luxury dark grid: left stats/calendar, centre charts/log, right ratios/streaks.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Api from '../../../services/Api';
import { computeStreaks } from '../../../lib/aura-analysis/trader-cv/streakEngine';
import '../../../styles/aura-analysis/Overview.css';

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── Animated counter hook ─────────────────────────────────────
function useCountUp(target, duration = 1100) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    let startTs = null;
    const tick = (ts) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * ease);
      if (p < 1) requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return val;
}

function fmt$(n, alwaysSign = true) {
  if (n == null || Number.isNaN(Number(n))) return '$0';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (alwaysSign) return v >= 0 ? `+$${abs}` : `-$${abs}`;
  return `$${abs}`;
}

function fmtPnL(n) {
  if (n == null || Number.isNaN(Number(n))) return '$0';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

function buildEquityCurve(trades, startBalance = 10000) {
  const sorted = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt || a.date) - new Date(b.created_at || b.createdAt || b.date));
  const out = [{ date: sorted[0] ? (sorted[0].created_at || sorted[0].createdAt || sorted[0].date) : new Date().toISOString(), equity: startBalance }];
  let equity = startBalance;
  sorted.forEach((t) => {
    equity += Number(t.pnl) || 0;
    out.push({ date: t.created_at || t.createdAt || t.date, equity });
  });
  return out;
}

function buildSessionPerformance(trades) {
  const bySession = {};
  trades.forEach((t) => {
    const session = (t.session || 'Unknown').trim() || 'Unknown';
    if (!bySession[session]) bySession[session] = { pnl: 0, count: 0, maxR: 0, totalR: 0, pairs: {} };
    const pnl = Number(t.pnl) || 0;
    bySession[session].pnl += pnl;
    bySession[session].count += 1;
    const r = Number(t.rMultiple) || Number(t.rr) || 0;
    if (Math.abs(r) > bySession[session].maxR) bySession[session].maxR = Math.abs(r);
    bySession[session].totalR += r;
    if (t.pair) bySession[session].pairs[t.pair] = (bySession[session].pairs[t.pair] || 0) + 1;
  });
  return Object.entries(bySession).map(([session, d]) => {
    const topPair = Object.entries(d.pairs).sort((a, b) => b[1] - a[1])[0];
    const avgRisk = d.count > 0 ? (d.totalR / d.count) : 0;
    return { session, pnl: d.pnl, count: d.count, maxR: d.maxR, avgRisk, topPair: topPair ? topPair[0] : '—' };
  }).sort((a, b) => b.pnl - a.pnl);
}

function buildDailyPnL(trades) {
  const byDay = {};
  trades.forEach((t) => {
    const d = (t.created_at || t.createdAt || t.date || '').toString().slice(0, 10);
    if (!d) return;
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += Number(t.pnl) || 0;
  });
  return Object.entries(byDay).map(([date, pnl]) => ({ date, pnl })).sort((a, b) => a.date.localeCompare(b.date));
}

function buildDistributionBuckets(trades, numBuckets = 20) {
  if (!trades.length) return [];
  const sorted = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt));
  const step = Math.max(1, Math.ceil(sorted.length / numBuckets));
  const out = [];
  for (let i = 0; i < sorted.length; i += step) {
    const chunk = sorted.slice(i, i + step);
    const total = chunk.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    out.push({ value: total, isWin: total >= 0 });
  }
  return out;
}

// SVG equity chart with hover tooltip
function EquitySVG({ data, width = 520, height = 200 }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <text x={width / 2} y={height / 2} fill="rgba(255,255,255,0.2)" textAnchor="middle" fontSize="12">No data yet</text>
      </svg>
    );
  }

  const minE = Math.min(...data.map(d => d.equity));
  const maxE = Math.max(...data.map(d => d.equity));
  const range = maxE - minE || 1;
  const pad = { t: 20, b: 28, l: 10, r: 52 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;

  const pts = data.map((d, i) => {
    const x = pad.l + (i / Math.max(1, data.length - 1)) * W;
    const y = pad.t + (1 - (d.equity - minE) / range) * H;
    return [x, y];
  });
  const polyline = pts.map(p => p.join(',')).join(' ');
  const fillPath = `M${pts[0][0]},${pad.t + H} L${pts.map(p => p.join(',')).join(' L')} L${pts[pts.length-1][0]},${pad.t + H} Z`;
  const dotStep = Math.max(1, Math.floor(data.length / 10));
  const dots = pts.filter((_, i) => i % dotStep === 0 || i === pts.length - 1);

  // Y-axis labels (4 levels)
  const yLabels = [0, 0.33, 0.66, 1].map(f => ({
    y: pad.t + (1 - f) * H,
    val: minE + f * range,
  }));

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const idx = Math.round(((mouseX - pad.l) / W) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    const pt = pts[clamped];
    const d = data[clamped];
    if (pt && d) {
      const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      setTooltip({ x: pt[0], y: pt[1], date: dateStr, equity: d.equity });
    }
  };

  const handleMouseLeave = () => setTooltip(null);

  const tooltipW = 90;
  const tooltipH = 34;
  const tx = tooltip ? Math.min(Math.max(tooltip.x - tooltipW / 2, pad.l), pad.l + W - tooltipW) : 0;
  const ty = tooltip ? Math.max(tooltip.y - tooltipH - 10, pad.t) : 0;

  return (
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none" className="ov-equity-svg"
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      style={{ cursor: 'crosshair' }}>
      <defs>
        <linearGradient id="eqGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#a78bfa" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
        </linearGradient>
        <filter id="eqGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid lines */}
      {yLabels.map((l, i) => (
        <line key={i} x1={pad.l} x2={pad.l + W} y1={l.y} y2={l.y}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
      ))}

      {/* Fill */}
      <path d={fillPath} fill="url(#eqGrad2)" />

      {/* Line */}
      <polyline points={polyline} fill="none" stroke="#a78bfa" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" filter="url(#eqGlow)" />

      {/* Y-axis labels (right side) */}
      {yLabels.map((l, i) => (
        <text key={i} x={pad.l + W + 4} y={l.y + 4}
          fill="rgba(255,255,255,0.3)" fontSize="8" textAnchor="start">
          ${(l.val / 1000).toFixed(1)}k
        </text>
      ))}

      {/* Dots */}
      {dots.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6" fill="transparent" stroke="transparent" />
          <circle cx={x} cy={y} r="4.5" fill="#0d0d1a" stroke="#a78bfa" strokeWidth="2" />
          <circle cx={x} cy={y} r="2.5" fill="#a78bfa" opacity="0.9" />
        </g>
      ))}

      {/* Crosshair line */}
      {tooltip && (
        <line x1={tooltip.x} x2={tooltip.x} y1={pad.t} y2={pad.t + H}
          stroke="rgba(167,139,250,0.35)" strokeWidth="1" strokeDasharray="3 3" />
      )}

      {/* Tooltip */}
      {tooltip && (
        <g>
          <rect x={tx} y={ty} width={tooltipW} height={tooltipH}
            rx="5" fill="rgba(20,15,35,0.95)" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
          <text x={tx + tooltipW / 2} y={ty + 12} fill="rgba(255,255,255,0.55)"
            fontSize="8" textAnchor="middle">{tooltip.date}</text>
          <text x={tx + tooltipW / 2} y={ty + 26} fill="#c4b5fd"
            fontSize="10" fontWeight="600" textAnchor="middle">
            ${Math.round(tooltip.equity).toLocaleString()}
          </text>
        </g>
      )}
    </svg>
  );
}

// SVG daily chart with hover tooltip
function DailySVG({ data, width = 520, height = 110 }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <text x={width/2} y={height/2} fill="rgba(255,255,255,0.2)" textAnchor="middle" fontSize="11">No daily data</text>
    </svg>
  );

  const vals = data.map(d => d.pnl);
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, 0);
  const range = maxV - minV || 1;
  const pad = { t: 10, b: 10, l: 6, r: 6 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const zeroY = pad.t + (1 - (0 - minV) / range) * H;
  const pts = vals.map((v, i) => {
    const x = pad.l + (i / Math.max(1, vals.length - 1)) * W;
    const y = pad.t + (1 - (v - minV) / range) * H;
    return [x, y];
  });
  const polyline = pts.map(p => p.join(',')).join(' ');

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const idx = Math.round(((mouseX - pad.l) / W) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    const pt = pts[clamped];
    const d = data[clamped];
    if (pt && d) setTooltip({ x: pt[0], y: pt[1], date: d.date, pnl: d.pnl });
  };

  return (
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none" className="ov-daily-svg"
      onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}
      style={{ cursor: 'crosshair' }}>
      <defs>
        <linearGradient id="dailyGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
        </linearGradient>
        <filter id="glowG2">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <line x1={pad.l} x2={pad.l+W} y1={zeroY} y2={zeroY}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d={`M${pts[0][0]},${zeroY} L${pts.map(p=>p.join(',')).join(' L')} L${pts[pts.length-1][0]},${zeroY} Z`}
        fill="url(#dailyGrad2)" />
      <polyline points={polyline} fill="none" stroke="#10b981" strokeWidth="2"
        strokeLinejoin="round" filter="url(#glowG2)" />
      {/* Crosshair */}
      {tooltip && (
        <line x1={tooltip.x} x2={tooltip.x} y1={pad.t} y2={pad.t + H}
          stroke="rgba(16,185,129,0.3)" strokeWidth="1" strokeDasharray="3 3" />
      )}
      {/* Active dot */}
      {tooltip && (
        <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#10b981"
          stroke="#08080f" strokeWidth="2" />
      )}
      {/* Tooltip */}
      {tooltip && (() => {
        const tw = 80; const th = 32;
        const tx = Math.min(Math.max(tooltip.x - tw/2, pad.l), pad.l + W - tw);
        const ty = Math.max(tooltip.y - th - 8, pad.t);
        const isPos = tooltip.pnl >= 0;
        return (
          <g>
            <rect x={tx} y={ty} width={tw} height={th} rx="4"
              fill="rgba(10,8,20,0.95)" stroke={isPos ? 'rgba(16,185,129,0.5)' : 'rgba(248,113,113,0.5)'} strokeWidth="1" />
            <text x={tx + tw/2} y={ty + 11} fill="rgba(255,255,255,0.5)"
              fontSize="7" textAnchor="middle">{tooltip.date}</text>
            <text x={tx + tw/2} y={ty + 24} fill={isPos ? '#4ade80' : '#f87171'}
              fontSize="9" fontWeight="700" textAnchor="middle">
              {isPos ? '+' : ''}{Math.round(tooltip.pnl).toLocaleString()}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// Animated donut chart
function DonutChart({ pct, size = 120, strokeW = 13, color = '#a78bfa', bg = 'rgba(255,255,255,0.07)', label, sub }) {
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (animPct / 100) * circ;
  const cx = size / 2;
  return (
    <div className="ov-donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={bg} strokeWidth={strokeW} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 8px ${color})`,
            transition: 'stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)'
          }} />
      </svg>
      <div className="ov-donut-inner">
        {label && <span className="ov-donut-pct">{label}</span>}
        {sub && <span className="ov-donut-sub">{sub}</span>}
      </div>
    </div>
  );
}

export default function OverviewDashboard() {
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [equityView, setEquityView] = useState('Day');
  const [dailyFilter, setDailyFilter] = useState('En');
  const [expandedRow, setExpandedRow] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Promise.all([
      Api.getAuraAnalysisTrades().then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl().then((r) => ({
        dailyPnl: r.data?.dailyPnl ?? 0,
        weeklyPnl: r.data?.weeklyPnl ?? 0,
        monthlyPnl: r.data?.monthlyPnl ?? 0,
      })),
    ])
      .then(([t, p]) => {
        setTrades(Array.isArray(t) ? t : []);
        setPnlData(typeof p === 'object' ? p : {});
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setTimeout(() => setMounted(true), 50);
      });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      Api.getAuraAnalysisTrades().then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl().then((r) => ({
        dailyPnl: r.data?.dailyPnl ?? 0,
        weeklyPnl: r.data?.weeklyPnl ?? 0,
        monthlyPnl: r.data?.monthlyPnl ?? 0,
      })),
    ])
      .then(([t, p]) => { setTrades(Array.isArray(t) ? t : []); setPnlData(typeof p === 'object' ? p : {}); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  // ── Computed metrics ───────────────────────────────────────
  const totalPnL = pnlData.monthlyPnl != null ? pnlData.monthlyPnl : trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = trades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const losses = trades.filter((t) => (Number(t.pnl) || 0) < 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const lossRate = 100 - winRate;
  const grossProfit = trades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(trades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '99' : '0');
  const avgR = trades.length ? (trades.reduce((s, t) => s + (Number(t.rMultiple) || Number(t.rr) || 0), 0) / trades.length) : 0;
  const expectancy = trades.length ? totalPnL / trades.length : 0;
  const startBalance = 10000;
  const equity = startBalance + totalPnL;
  const todayPct = pnlData.dailyPnl != null && equity ? ((pnlData.dailyPnl / (equity - (pnlData.dailyPnl || 0))) * 100).toFixed(1) : '0.0';
  const totalPct = ((totalPnL / startBalance) * 100).toFixed(2);

  // Pairs unique count
  const uniquePairs = useMemo(() => new Set(trades.map(t => t.pair).filter(Boolean)).size, [trades]);

  // ── Charts data ─────────────────────────────────────────────
  const equityCurve = useMemo(() => buildEquityCurve(trades, startBalance), [trades]);
  const sessionPerformance = useMemo(() => buildSessionPerformance(trades), [trades]);
  const dailyPnL = useMemo(() => buildDailyPnL(trades), [trades]);
  const distributionBuckets = useMemo(() => buildDistributionBuckets(trades, 24), [trades]);
  const streaks = useMemo(() => computeStreaks({}, trades), [trades]);

  const distMax = distributionBuckets.length ? Math.max(...distributionBuckets.map(b => Math.abs(b.value)), 1) : 1;

  const bestDay = useMemo(() => {
    if (!dailyPnL.length) return null;
    return dailyPnL.reduce((a, b) => (a.pnl >= b.pnl ? a : b), { date: '', pnl: -Infinity });
  }, [dailyPnL]);
  const worstDay = useMemo(() => {
    if (!dailyPnL.length) return null;
    return dailyPnL.reduce((a, b) => (a.pnl <= b.pnl ? a : b), { date: '', pnl: Infinity });
  }, [dailyPnL]);

  // Win/loss profitable days
  const winDays = dailyPnL.filter(d => d.pnl > 0).length;
  const allTradeDays = dailyPnL.length;
  const winDayRate = allTradeDays ? Math.round((winDays / allTradeDays) * 100) : 0;
  const lossDayRate = 100 - winDayRate;

  // Compliance (proportion of trades with riskPercent ≤ 2%)
  const complianceTrades = trades.filter(t => t.riskPercent != null && Number(t.riskPercent) <= 2).length;
  const compliance = trades.length ? Math.round((complianceTrades / trades.length) * 100) : 84;

  // ── Calendar ────────────────────────────────────────────────
  const yearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const monthTrades = useMemo(() =>
    trades.filter((t) => {
      const d = t.created_at || t.createdAt || t.date;
      if (!d) return false;
      return new Date(d).toISOString().slice(0, 7) === yearMonth;
    }),
    [trades, yearMonth]
  );
  const byDay = useMemo(() => {
    const o = {};
    monthTrades.forEach((t) => {
      const key = (t.created_at || t.createdAt || t.date || '').toString().slice(0, 10);
      if (!key) return;
      if (!o[key]) o[key] = 0;
      o[key] += Number(t.pnl) || 0;
    });
    return o;
  }, [monthTrades]);

  const calendarDays = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const out = [];
    for (let i = 0; i < startPad; i++) out.push({ day: '', pnl: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ day: d, pnl: byDay[key] ?? null });
    }
    const remainder = (startPad + daysInMonth) % 7;
    if (remainder) for (let i = 0; i < 7 - remainder; i++) out.push({ day: '', pnl: null });
    return out;
  }, [viewDate, byDay]);

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  const monthLabel = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Drawdown pct for calendar footer
  const calMonthPnl = monthTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const calMonthPct = equity > 0 ? ((calMonthPnl / equity) * 100).toFixed(1) : '0.0';

  const recentTrades = useMemo(() => [...trades]
    .sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
    .slice(0, 12), [trades]);

  // Animated equity value
  const equityAnimated = useCountUp(equity, 1200);
  const winRateAnimated = useCountUp(winRate, 900);

  if (loading) {
    return (
      <div className="ov2-page">
        <div className="ov2-loading">
          <div className="ov2-spinner" />
          <p>Loading analytics…</p>
        </div>
      </div>
    );
  }

  const cardClass = (delay = 0) =>
    `ov2-card${mounted ? ' ov2-card-in' : ''}${delay ? ` ov2-card-delay-${delay}` : ''}`;

  const streakItems = [
    { icon: '🔥', label: 'Profit streaks', value: streaks.journalStreak || 0, tag: `top ${Math.min(streaks.journalStreak || 0, 25)}` },
    { icon: '📉', label: 'Drawdown treat', value: streaks.ruleAdherenceStreak || 0, tag: `$0.${Math.abs(streaks.ruleAdherenceStreak || 0) * 25}` },
    { icon: '⚡', label: 'Edge recovery', value: streaks.disciplinedDaysStreak || 0, tag: `$${(streaks.disciplinedDaysStreak || 0) * 20}` },
    { icon: '🎯', label: 'Consistency', value: winDayRate, tag: `${winDayRate}%` },
  ];

  return (
    <div className="ov2-page">
      <div className="ov2-grid">

        {/* ── LEFT COLUMN ─────────────────────────────────── */}
        <div className="ov2-col ov2-col-left">

          {/* Overview card */}
          <div className={cardClass(0)}>
            <div className="ov2-card-title">Overview</div>

            <div className="ov2-equity-row">
              <div className="ov2-equity-label">Equity</div>
              <div className="ov2-equity-badges">
                <span className="ov2-badge ov2-badge-up">▲ {Math.abs(todayPct)}% today</span>
              </div>
            </div>
            <div className="ov2-equity-amount">${Math.abs(Math.round(equityAnimated)).toLocaleString('en-US')}</div>
            <div className="ov2-equity-pcts">
              <span className="ov2-pct-green">{todayPct}%</span>
              <span className="ov2-pct-green2">{totalPct}%</span>
            </div>

            <div className="ov2-stat-grid2">
              <div className="ov2-stat-cell">
                <div className="ov2-stat-label">Net P/L</div>
                <div className={`ov2-stat-val ${totalPnL >= 0 ? 'green' : 'red'}`}>{fmtPnL(totalPnL)}</div>
              </div>
              <div className="ov2-stat-cell">
                <div className="ov2-stat-label">Win Rate</div>
                <div className="ov2-stat-val green">{Math.round(winRateAnimated)}%</div>
              </div>
              <div className="ov2-stat-cell">
                <div className="ov2-stat-label">Profit Factor</div>
                <div className="ov2-stat-val">{profitFactor}</div>
              </div>
              <div className="ov2-stat-cell">
                <div className="ov2-stat-label">Expectancy</div>
                <div className={`ov2-stat-val ${expectancy >= 0 ? 'green' : 'red'}`}>{expectancy >= 0 ? '+' : ''}{fmtPnL(expectancy).replace('+', '')} / Trade</div>
              </div>
            </div>

            <div className="ov2-risk-row">
              <span className="ov2-risk-icon">🛡</span>
              <div>
                <div className="ov2-stat-label">Risk Score</div>
                <div className="ov2-risk-val">Low Risk <span className="ov2-risk-pct">1.5%</span></div>
              </div>
            </div>
          </div>

          {/* Calendar */}
          <div className={cardClass(1)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Calendar</div>
              <div className="ov2-date-sub">{monthLabel}</div>
            </div>
            <div className="ov2-cal-nav">
              <button className="ov2-nav-btn" onClick={prevMonth}>‹</button>
              <div className="ov2-cal-month-row">
                <span className="ov2-cal-month">{viewDate.toLocaleString('en-US', { month: 'long' })}</span>
                <button className={`ov2-cal-refresh${refreshing ? ' ov2-spinning' : ''}`} onClick={handleRefresh} title="Refresh data">↺</button>
              </div>
              <button className="ov2-nav-btn" onClick={nextMonth}>›</button>
            </div>
            <div className="ov2-cal-grid">
              {WEEKDAYS_SHORT.map((d, i) => (
                <div key={i} className="ov2-cal-dow">{d}</div>
              ))}
              {calendarDays.map((cell, i) =>
                cell.day === '' ? (
                  <div key={`e-${i}`} className="ov2-cal-cell ov2-cal-empty" />
                ) : (
                  <div key={cell.day} className={`ov2-cal-cell${cell.pnl != null ? (cell.pnl >= 0 ? ' ov2-cal-win' : ' ov2-cal-loss') : ''}`}>
                    <span className="ov2-cal-num">{cell.day}</span>
                    {cell.pnl != null && (
                      <span className={`ov2-cal-pnl ${cell.pnl >= 0 ? 'green' : 'red'}`}>
                        {cell.pnl >= 0 ? '+' : ''}{Math.round(cell.pnl)}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
            <div className="ov2-cal-footer">
              <span className="ov2-cal-drawdown">{monthLabel.split(' ')[0]} {calMonthPct}%</span>
              <button className="ov2-cal-enter">Enter</button>
            </div>
          </div>

          {/* Key Stats */}
          <div className={cardClass(2)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Key Stats</div>
              <div className="ov2-stat-badges-row">
                <span className="ov2-badge-tag">▲ 1st only</span>
                <span className="ov2-badge-num">517</span>
                <span className="ov2-badge-num2">$30</span>
              </div>
            </div>
            <div className="ov2-key-stats">
              <div className="ov2-ks-row">
                <span className="ov2-ks-label">Trade Range</span>
                <span className="ov2-ks-mid">Normal Risks</span>
                <span className="ov2-ks-val">{trades.length}</span>
              </div>
              <div className="ov2-ks-row">
                <span className="ov2-ks-label">Total Pairs</span>
                <span className="ov2-ks-mid">Left in Trades</span>
                <span className="ov2-ks-val">{uniquePairs}</span>
              </div>
              <div className="ov2-ks-row">
                <span className="ov2-ks-label">Win Gate</span>
                <span className="ov2-ks-mid">Secure Footins</span>
                <span className="ov2-ks-val green">{winRate}%</span>
              </div>
              <div className="ov2-ks-row">
                <span className="ov2-ks-label">B/k Expect.</span>
                <span className="ov2-ks-mid">{trades.length} (0.1%)</span>
                <span className="ov2-ks-val">{profitFactor}</span>
              </div>
              <div className="ov2-ks-row">
                <span className="ov2-ks-label">Avg RR</span>
                <span className="ov2-ks-mid">{avgR > 0 ? avgR.toFixed(1) + 'R' : '—'}</span>
                <span className="ov2-ks-val">{wins > 0 ? (grossProfit / wins).toFixed(0) : '—'}</span>
              </div>
            </div>
            {/* Mini sparkline bar */}
            <div className="ov2-ks-mini-bars">
              {distributionBuckets.slice(0, 8).map((b, i) => (
                <div key={i} className={`ov2-ks-bar ${b.isWin ? 'win' : 'loss'}`}
                  style={{ height: `${Math.max(4, (Math.abs(b.value) / distMax) * 32)}px` }} />
              ))}
            </div>
            <div className="ov2-ks-tags">
              <span className="ov2-ks-tag purple">JT</span>
              <span className="ov2-ks-tag teal">D&amp;N</span>
              <span className="ov2-ks-tag blue">LEND</span>
              <span className="ov2-ks-tag dim">5th</span>
            </div>
          </div>
        </div>

        {/* ── MIDDLE COLUMN ───────────────────────────────── */}
        <div className="ov2-col ov2-col-mid">

          {/* Equity Curve */}
          <div className={cardClass(0)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Equity Curve</div>
              <div className="ov2-card-controls">
                <span className="ov2-date-range">
                  {equityCurve.length > 1
                    ? `${new Date(equityCurve[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(equityCurve[equityCurve.length - 1].date).getFullYear()}`
                    : 'Apr 1 – 2024'}
                </span>
                {['Day', 'Week'].map(v => (
                  <button key={v} className={`ov2-view-btn ${equityView === v ? 'active' : ''}`} onClick={() => setEquityView(v)}>{v}</button>
                ))}
              </div>
            </div>
            <div className="ov2-chart-wrap ov2-equity-chart">
              <EquitySVG data={equityCurve} width={520} height={200} />
            </div>
          </div>

          {/* Daily */}
          <div className={cardClass(1)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title-row">
                <span className="ov2-card-title">Daily</span>
                <span className="ov2-daily-pct green">{winDayRate}%</span>
                <span className="ov2-daily-pct red">{lossDayRate}%</span>
              </div>
              <div className="ov2-daily-filters">
                {['En', 'Back', 'Wmtr', 'Entrony'].map(f => (
                  <button key={f} className={`ov2-filter-btn ${dailyFilter === f ? 'active' : ''}`} onClick={() => setDailyFilter(f)}>{f}</button>
                ))}
              </div>
            </div>
            <div className="ov2-chart-wrap ov2-daily-chart">
              <DailySVG data={dailyPnL} width={520} height={110} />
            </div>
          </div>

          {/* Sessions */}
          <div className={cardClass(2)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Sessions</div>
              <div className="ov2-session-cols-hdr">
                <span>Max RR</span>
                <span>Avg Risk</span>
                <span>{trades.length} Trades</span>
              </div>
            </div>
            {sessionPerformance.length ? (
              <div className="ov2-sessions">
                {sessionPerformance.map(({ session, pnl, maxR, avgRisk, count, topPair }) => (
                  <div key={session} className="ov2-session-row">
                    <div className="ov2-sess-name">{session}</div>
                    <div className={`ov2-sess-pnl ${pnl >= 0 ? 'green' : 'red'}`}>{fmtPnL(pnl)}</div>
                    <div className="ov2-sess-maxr">
                      <span className="ov2-rr-dot green" />
                      <span className="ov2-rr-dot green" />
                      {maxR > 0 ? `${maxR.toFixed(1)}R` : '—'}
                    </div>
                    <div className="ov2-sess-risk">
                      <span className="ov2-risk-arrow">↑</span>
                      {avgRisk > 0 ? `${avgRisk.toFixed(2)}%` : '—'}
                    </div>
                    <div className="ov2-sess-pair">
                      <span className="ov2-pair-dot" />
                      {topPair}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ov2-empty">No session data yet</p>
            )}
          </div>

          {/* Trade Log */}
          <div className={`${cardClass(3)} ov2-trade-log-card`}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Trade Log</div>
              <div className="ov2-tl-actions">
                <span className="ov2-tl-badge">↑↓ STR99</span>
                <span className="ov2-tl-badge">↑ Naleze</span>
              </div>
            </div>
            <div className="ov2-tl-wrap">
              <table className="ov2-tl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pair</th>
                    <th>Setup</th>
                    <th>Result</th>
                    <th>P/L (R)</th>
                    <th>RR</th>
                    <th>Session</th>
                    <th>Risk</th>
                    <th>Notes</th>
                    <th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.length ? recentTrades.map((t, idx) => {
                    const pnl = Number(t.pnl) || 0;
                    const rr = t.rMultiple != null ? Number(t.rMultiple) : (t.rr != null ? Number(t.rr) : null);
                    const isWin = pnl > 0;
                    const isExpanded = expandedRow === (t.id || idx);
                    return (
                      <React.Fragment key={t.id || idx}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : (t.id || idx))}
                          style={{ cursor: 'pointer' }}
                          className={isExpanded ? 'ov2-tl-row-active' : ''}
                        >
                          <td className="ov2-tl-date">
                            {new Date(t.created_at || t.createdAt || Date.now()).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                          </td>
                          <td>
                            <div className="ov2-pair-cell">
                              <span className={`ov2-pair-flag ${isWin ? 'green' : 'red'}`} />
                              {t.pair || '—'}
                            </div>
                          </td>
                          <td>{t.setup || t.pattern || '—'}</td>
                          <td>
                            <span className={`ov2-result-badge ${isWin ? 'win' : 'loss'}`}>
                              {isWin ? 'Win' : 'Loss'}
                            </span>
                          </td>
                          <td className={pnl >= 0 ? 'green' : 'red'}>{fmtPnL(pnl)}</td>
                          <td className={rr != null && rr >= 0 ? 'green' : 'red'}>
                            {rr != null ? `${rr > 0 ? '+' : ''}${rr.toFixed(1)}R` : '—'}
                          </td>
                          <td>{t.session || '—'}</td>
                          <td>{t.riskPercent != null ? `${t.riskPercent}%` : '—'}</td>
                          <td className="ov2-tl-notes">{t.notes || '—'}</td>
                          <td>
                            {t.proof || t.screenshot ? (
                              <a href={t.proof || t.screenshot} target="_blank" rel="noopener noreferrer" className="ov2-proof-link" onClick={e => e.stopPropagation()}>📎</a>
                            ) : <span className="ov2-tl-dim">—</span>}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="ov2-tl-expanded">
                            <td colSpan="10">
                              <div className="ov2-tl-expand-body">
                                <div className="ov2-tl-expand-item"><span>Entry</span><strong>{t.entryPrice || '—'}</strong></div>
                                <div className="ov2-tl-expand-item"><span>SL</span><strong className="red">{t.stopLoss || '—'}</strong></div>
                                <div className="ov2-tl-expand-item"><span>TP</span><strong className="green">{t.takeProfit || '—'}</strong></div>
                                <div className="ov2-tl-expand-item"><span>Lot Size</span><strong>{t.positionSize || '—'}</strong></div>
                                <div className="ov2-tl-expand-item"><span>Risk $</span><strong>{t.riskAmount ? `$${Number(t.riskAmount).toFixed(0)}` : '—'}</strong></div>
                                <div className="ov2-tl-expand-item"><span>Direction</span><strong>{t.direction?.toUpperCase() || '—'}</strong></div>
                                {t.notes && <div className="ov2-tl-expand-notes"><span>Notes:</span> {t.notes}</div>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }) : (
                    <tr><td colSpan="10" className="ov2-empty-row">No trades recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────── */}
        <div className="ov2-col ov2-col-right">

          {/* Win/Loss donut (compact) */}
          <div className={`${cardClass(0)} ov2-wl-top`}>
            <div className="ov2-card-title">Win/Loss Ratio</div>
            <div className="ov2-wl-center">
              <DonutChart pct={winRate} size={130} strokeW={14} color="#a78bfa" label={`${winRate}%`} sub="We Win" />
            </div>
            <div className="ov2-wl-legend">
              <span className="ov2-wl-dot purple" /> Wins
              <span className="ov2-wl-dot red" /> Losses
            </div>
          </div>

          {/* Win/Loss detail card */}
          <div className={cardClass(1)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Win/Loss Ratio</div>
              <div className="ov2-wl-delta green">▲ +{avgR > 0 ? avgR.toFixed(1) : '0.0'}RR</div>
            </div>
            <div className="ov2-wl-pcts">
              <span className="ov2-wl-big green">{winRate}%</span>
              <span className="ov2-wl-big red">{lossRate}%</span>
            </div>
            <div className="ov2-wl-days">
              <div className="ov2-wl-day-row">
                <span className="ov2-wl-day-label">Best Day</span>
                <span className="ov2-wl-day-val green">
                  {bestDay ? `${fmt$(bestDay.pnl)} ${new Date(bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '—'}
                </span>
              </div>
              <div className="ov2-wl-day-row">
                <span className="ov2-wl-day-label">Worst Day</span>
                <span className={`ov2-wl-day-val ${worstDay && worstDay.pnl < 0 ? 'red' : 'green'}`}>
                  {worstDay ? `${fmt$(worstDay.pnl)} ${new Date(worstDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '—'}
                </span>
              </div>
            </div>
            <div className="ov2-compliance-row">
              <DonutChart pct={compliance} size={100} strokeW={11} color="#10b981" bg="rgba(16,185,129,0.12)" label={`${compliance}%`} />
              <div className="ov2-compliance-text">
                <div className="ov2-compliance-title">Risk · Compliance</div>
                <div className="ov2-compliance-sub">{compliance}% of trades within risk rules</div>
              </div>
            </div>
          </div>

          {/* Trade Distribution */}
          <div className={cardClass(2)}>
            <div className="ov2-card-head">
              <div className="ov2-card-title">Trade Distribution</div>
              <span className="ov2-dist-label">Growth model</span>
            </div>
            <div className="ov2-dist-chart">
              {distributionBuckets.length ? distributionBuckets.map((b, i) => (
                <div key={i} className={`ov2-dist-bar ${b.isWin ? 'win' : 'loss'}`}
                  style={{ height: `${Math.max(4, (Math.abs(b.value) / distMax) * 72)}px` }}
                  title={fmtPnL(b.value)} />
              )) : Array.from({ length: 16 }, (_, i) => (
                <div key={i} className="ov2-dist-bar win" style={{ height: `${4 + Math.random() * 30}px` }} />
              ))}
            </div>
            <div className="ov2-dist-labels">
              {[0, 100, 200, 300, 400, 170, 240, 365].map((v, i) => (
                <span key={i}>{v}</span>
              ))}
            </div>
          </div>

          {/* Streaks */}
          <div className={cardClass(3)}>
            <div className="ov2-card-title">Streaks</div>
            <div className="ov2-streaks">
              {streakItems.map((s, i) => (
                <div key={i} className="ov2-streak-row">
                  <span className="ov2-streak-icon">{s.icon}</span>
                  <div className="ov2-streak-info">
                    <span className="ov2-streak-label">{s.label}</span>
                    <span className="ov2-streak-tag">{s.tag}</span>
                  </div>
                  <div className="ov2-streak-val">
                    <span className={`ov2-streak-num ${s.value > 0 ? 'green' : 'muted'}`}>{s.value}</span>
                    <span className={`ov2-streak-arrow ${s.value > 0 ? 'green' : 'muted'}`}>{s.value > 0 ? '▲' : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
