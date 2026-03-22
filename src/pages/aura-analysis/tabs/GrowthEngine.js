import React, { useMemo } from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

/* ── Growth curve SVG ─────────────────────────────────────── */
function GrowthCurve({ curve, height = 160 }) {
  if (!curve || curve.length < 2) return (
    <div className="aa-empty" style={{ padding: '40px 0' }}>No growth data yet</div>
  );
  const W = 600; const H = height;
  const vals = curve.map(p => p.balance);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const range = mx - mn || 1;
  const pad = { t: 16, b: 28, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map(v => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b));

  /* 0-line */
  const zeroY = pad.t + (1 - (vals[0] - mn) / range) * (H - pad.t - pad.b);

  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length-1].toFixed(1)},${H-pad.b} L${xs[0].toFixed(1)},${H-pad.b} Z`;
  const isUp = vals[vals.length - 1] >= vals[0];
  const col  = isUp ? '#10b981' : '#ef4444';

  /* Milestone ticks (every 10% return) */
  const startBal = vals[0];
  const milestones = [];
  [10, 20, 50, 100].forEach(pct => {
    const target = startBal * (1 + pct / 100);
    if (target <= mx) {
      const yPos = pad.t + (1 - (target - mn) / range) * (H - pad.t - pad.b);
      milestones.push({ pct, yPos });
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="gr-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.25" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Milestone reference lines */}
      {milestones.map(({ pct, yPos }) => (
        <g key={pct}>
          <line x1={pad.l} y1={yPos} x2={W - pad.r} y2={yPos}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - pad.r - 2} y={yPos - 3} fontSize="9" fill="rgba(255,255,255,0.2)" textAnchor="end">+{pct}%</text>
        </g>
      ))}
      <path d={area} fill="url(#gr-area)" />
      <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Start + end markers */}
      <circle cx={xs[0]} cy={ys[0]} r="3.5" fill="rgba(255,255,255,0.3)" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="4" fill={col} />
    </svg>
  );
}

/* ── Monthly progression bars ─────────────────────────────── */
function MonthBars({ byMonth }) {
  if (!byMonth.length) return <div className="aa-empty">No monthly data</div>;
  const recent = byMonth.slice(-12);
  const maxAbs = Math.max(...recent.map(m => Math.abs(m.pnl)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {recent.map(mo => {
        const bw = Math.abs(mo.pnl) / maxAbs * 100;
        const lbl = new Date(mo.month + '-15').toLocaleString('en-US', { month: 'short', year: '2-digit' });
        return (
          <div key={mo.month} className="aa-bar-row">
            <span className="aa-bar-label">{lbl}</span>
            <div className="aa-bar-track">
              <div className={`aa-bar-fill ${mo.pnl >= 0 ? 'aa-bar-fill--green' : 'aa-bar-fill--red'}`} style={{ width: `${bw}%` }} />
            </div>
            <span className={`aa-bar-val ${pnlCls(mo.pnl)}`}>{fmtPnl(mo.pnl)}</span>
            <span className="aa-bar-meta">{fmtPct(mo.winRate)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Milestone card ───────────────────────────────────────── */
function Milestone({ icon, label, value, color, achieved }) {
  return (
    <div style={{
      background: achieved ? `${color}12` : 'rgba(255,255,255,0.025)',
      border: `1px solid ${achieved ? color + '30' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      opacity: achieved ? 1 : 0.45,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: '0.9rem', flexShrink: 0 }}>
        <i className={`fas ${icon}`} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: achieved ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>{label}</div>
        <div style={{ fontSize: '0.62rem', color: achieved ? color : 'rgba(255,255,255,0.25)', marginTop: 2 }}>{value}</div>
      </div>
      {achieved && <i className="fas fa-check-circle" style={{ color, fontSize: '0.85rem', flexShrink: 0 }} />}
    </div>
  );
}

export default function GrowthEngine() {
  const { analytics: a, account, trades, loading, error } = useAuraAnalysis();

  /* ── Compound projection ── */
  const projection = useMemo(() => {
    if (!a.byMonth.length || a.byMonth.length < 2) return null;
    const avgMonthlyPct = a.byMonth.reduce((s, m) => s + (m.pnl / (a.startBalance || 10000)) * 100, 0) / a.byMonth.length;
    const current = a.currentBalance || a.startBalance || 10000;
    const months3  = current * Math.pow(1 + avgMonthlyPct / 100, 3);
    const months6  = current * Math.pow(1 + avgMonthlyPct / 100, 6);
    const months12 = current * Math.pow(1 + avgMonthlyPct / 100, 12);
    return { avgMonthlyPct, months3, months6, months12 };
  }, [a.byMonth, a.startBalance, a.currentBalance]);

  /* ── Milestones ── */
  const cur = a.currentBalance || 0;
  const start = a.startBalance || 0;
  const returnPct = a.totalReturnPct;

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
      <div className="aa-skeleton aa-skeleton-chart" />
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) return (
    <div className="aa-page">
      <div className="aa-no-platform">
        <div className="aa-no-platform-icon"><i className="fas fa-seedling" /></div>
        <h3>Start trading to track growth</h3>
        <p>Your account growth curve and milestones will appear here.</p>
      </div>
    </div>
  );

  const currency = account?.currency || 'USD';
  const fmtBal = v => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0);

  return (
    <div className="aa-page">

      {/* ── Growth KPIs ── */}
      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Return',    value: fmtPnl(a.totalReturn),           cls: pnlCls(a.totalReturn), sub: `from ${fmtBal(start)}` },
          { label: 'Return %',        value: fmtPct(a.totalReturnPct) + '%',  cls: a.totalReturnPct >= 0 ? 'aa--green' : 'aa--red', sub: 'overall' },
          { label: 'Best Month',      value: a.bestMonth  ? fmtPnl(a.bestMonth.pnl)  : '—', cls: 'aa--green', sub: a.bestMonth?.month },
          { label: 'Worst Month',     value: a.worstMonth ? fmtPnl(a.worstMonth.pnl) : '—', cls: 'aa--red',   sub: a.worstMonth?.month },
          { label: 'Profitable Mons', value: String(a.profitableMonths),      cls: a.profitableMonths >= 2 ? 'aa--green' : 'aa--muted', sub: 'consecutive' },
          { label: 'Win Months',      value: String(a.byMonth.filter(m => m.pnl > 0).length) + ' / ' + a.byMonth.length, cls: '' },
          { label: 'Avg Monthly P/L', value: a.byMonth.length > 0 ? fmtPnl(a.byMonth.reduce((s, m) => s + m.pnl, 0) / a.byMonth.length) : '—', cls: pnlCls(a.byMonth.length > 0 ? a.byMonth.reduce((s, m) => s + m.pnl, 0) / a.byMonth.length : 0) },
          { label: 'Current Balance', value: fmtBal(cur), cls: '', sub: currency },
        ].map(({ label, value, cls, sub }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {/* ── Growth curve ── */}
      <div className="aa-chart-wrap" style={{ marginBottom: 16 }}>
        <div className="aa-chart-title">Account Growth Curve</div>
        <GrowthCurve curve={a.equityCurve} height={160} />
      </div>

      {/* ── Monthly bars + Projections ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Monthly Progression</div>
          <MonthBars byMonth={a.byMonth} />
        </div>

        {projection ? (
          <div className="aa-card">
            <div className="aa-section-title">Compound Projection</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.5 }}>
              Based on avg monthly return of{' '}
              <span style={{ color: projection.avgMonthlyPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                {fmtPct(projection.avgMonthlyPct)}%
              </span>
              {' '}applied to current balance.
            </div>
            {[
              { label: '3 Months',  value: fmtBal(projection.months3),  chg: projection.months3  - cur },
              { label: '6 Months',  value: fmtBal(projection.months6),  chg: projection.months6  - cur },
              { label: '12 Months', value: fmtBal(projection.months12), chg: projection.months12 - cur },
            ].map(({ label, value, chg }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  <div style={{ fontSize: '0.65rem', color: chg >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPnl(chg)}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8 }}>
              <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                Projection assumes constant returns. Past performance does not guarantee future results.
              </span>
            </div>
          </div>
        ) : (
          <div className="aa-card">
            <div className="aa-section-title">Compound Projection</div>
            <div className="aa-empty">Need at least 2 months of data for projections.</div>
          </div>
        )}
      </div>

      {/* ── Milestones ── */}
      <div className="aa-card">
        <div className="aa-section-title-lg" style={{ marginBottom: 14 }}>
          <span className="aa-title-dot" style={{ background: '#f59e0b' }} />
          Growth Milestones
        </div>
        <div className="aa-grid-3" style={{ gap: 8 }}>
          <Milestone icon="fa-chart-line"    label="First Profitable Month"     value="Complete at least 1 profitable month"          achieved={a.byMonth.some(m => m.pnl > 0)}                color="#10b981" />
          <Milestone icon="fa-fire"          label="Win Streak ≥ 3"             value={`Best: ${a.maxWinStreak} consecutive wins`}     achieved={a.maxWinStreak >= 3}                             color="#f59e0b" />
          <Milestone icon="fa-trophy"        label="+10% Total Return"          value={`Current: ${fmtPct(returnPct)}%`}               achieved={returnPct >= 10}                                 color="#eaa960" />
          <Milestone icon="fa-shield-alt"    label="90% SL Coverage"            value={`Current: ${fmtPct(a.pctWithSL)}%`}            achieved={a.pctWithSL >= 90}                               color="#10b981" />
          <Milestone icon="fa-bullseye"      label="Profit Factor ≥ 2.0"        value={`Current: ${a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—'}`} achieved={a.profitFactor >= 2}   color="#10b981" />
          <Milestone icon="fa-calendar-check" label="3 Consecutive Profit Months" value={`Current: ${a.profitableMonths} months`}    achieved={a.profitableMonths >= 3}                         color="#eaa960" />
          <Milestone icon="fa-percent"        label="+25% Total Return"         value={`Current: ${fmtPct(returnPct)}%`}               achieved={returnPct >= 25}                                 color="#f59e0b" />
          <Milestone icon="fa-star"           label="Win Rate ≥ 60%"            value={`Current: ${fmtPct(a.winRate)}%`}               achieved={a.winRate >= 60}                                 color="#f59e0b" />
          <Milestone icon="fa-gem"            label="+50% Total Return"         value={`Current: ${fmtPct(returnPct)}%`}               achieved={returnPct >= 50}                                 color="#ef4444" />
        </div>
      </div>

    </div>
  );
}
