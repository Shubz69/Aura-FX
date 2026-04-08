import React, { memo, useMemo, useCallback } from 'react';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import { AuraEquityAreaChart, AuraDrawdownAreaChart } from '../../../components/aura-analysis/AuraPerformanceCharts';
import { useAuraPerfSection, useIdleDeferredReady, useInViewOnce } from '../auraTabPerf';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

const MonthBars = memo(function MonthBars({ byMonth }) {
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
});

function Milestone({ icon, label, value, color, achieved }) {
  return (
    <div
      className={achieved ? 'aa-milestone aa-milestone--done' : 'aa-milestone aa-milestone--pending'}
      style={{
        background: achieved ? `${color}14` : 'rgba(255,255,255,0.055)',
        border: `1px solid ${achieved ? `${color}44` : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: achieved ? `${color}22` : 'rgba(255,255,255,0.08)',
          border: `1px solid ${achieved ? `${color}40` : 'rgba(248,195,125,0.22)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: achieved ? color : 'rgba(248,195,125,0.72)',
          fontSize: '0.9rem',
          flexShrink: 0,
        }}
      >
        <i className={`fas ${icon}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: achieved ? 'rgba(255,255,255,0.95)' : 'rgba(255,248,240,0.82)',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: '0.65rem',
            color: achieved ? color : 'rgba(232,225,210,0.68)',
            marginTop: 3,
            lineHeight: 1.35,
          }}
        >
          {value}
        </div>
      </div>
      {achieved && <i className="fas fa-check-circle" style={{ color, fontSize: '0.85rem', flexShrink: 0 }} />}
    </div>
  );
}

const GrowthEngineBody = memo(function GrowthEngineBody({ currency }) {
  const { analytics: a, analyticsDataKey } = useAuraAnalysisMetrics();
  useAuraPerfSection('GrowthEngine.body');
  const deferLower = useIdleDeferredReady(analyticsDataKey || '');
  const [mileRef, mileVis] = useInViewOnce({ rootMargin: '200px' });

  const fmtBal = useCallback(
    (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v || 0),
    [currency]
  );

  const projection = useMemo(() => {
    if (!a.byMonth.length || a.byMonth.length < 2) return null;
    const avgMonthlyPct = a.byMonth.reduce((s, m) => s + (m.pnl / (a.startBalance || 10000)) * 100, 0) / a.byMonth.length;
    const current = a.currentBalance || a.startBalance || 10000;
    const months3 = current * Math.pow(1 + avgMonthlyPct / 100, 3);
    const months6 = current * Math.pow(1 + avgMonthlyPct / 100, 6);
    const months12 = current * Math.pow(1 + avgMonthlyPct / 100, 12);
    return { avgMonthlyPct, months3, months6, months12 };
  }, [a.byMonth, a.startBalance, a.currentBalance]);

  const cur = a.currentBalance || 0;
  const start = a.startBalance || 0;
  const returnPct = a.totalReturnPct;

  return (
    <div className="aa-page aa-page--growth-readability">

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <AuraEquityAreaChart curve={a.equityCurve} height={168} title="Account growth curve" />
        <AuraDrawdownAreaChart curve={a.drawdownCurve} height={168} title="Drawdown % (risk context)" />
      </div>

      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Return', value: fmtPnl(a.totalReturn), cls: pnlCls(a.totalReturn), sub: `from ${fmtBal(start)}` },
          { label: 'Return %', value: fmtPct(a.totalReturnPct), cls: a.totalReturnPct >= 0 ? 'aa--green' : 'aa--red', sub: 'overall' },
          { label: 'CAGR (est.)', value: a.periodYears > 0.05 ? fmtPct(a.cagrPct) : '—', cls: a.cagrPct >= 0 ? 'aa--green' : 'aa--red', sub: 'From trade span' },
          { label: 'Calmar (est.)', value: a.calmarRatio > 0 ? fmtNum(a.calmarRatio, 2) : '—', cls: a.calmarRatio >= 1.5 ? 'aa--green' : '', sub: 'Return eff. vs DD' },
          { label: 'Best Month', value: a.bestMonth ? fmtPnl(a.bestMonth.pnl) : '—', cls: 'aa--green', sub: a.bestMonth?.month },
          { label: 'Worst Month', value: a.worstMonth ? fmtPnl(a.worstMonth.pnl) : '—', cls: 'aa--red', sub: a.worstMonth?.month },
          { label: 'Profitable Mons', value: String(a.profitableMonths), cls: a.profitableMonths >= 2 ? 'aa--green' : 'aa--muted', sub: 'consecutive' },
          { label: 'Win Months', value: String(a.byMonth.filter(m => m.pnl > 0).length) + ' / ' + a.byMonth.length, cls: '' },
          { label: 'Avg Monthly P/L', value: a.byMonth.length > 0 ? fmtPnl(a.byMonth.reduce((s, m) => s + m.pnl, 0) / a.byMonth.length) : '—', cls: pnlCls(a.byMonth.length > 0 ? a.byMonth.reduce((s, m) => s + m.pnl, 0) / a.byMonth.length : 0) },
          { label: 'Recovery factor', value: a.recoveryFactor > 0 && a.recoveryFactor < 900 ? fmtNum(a.recoveryFactor, 2) : a.recoveryFactor >= 900 ? '∞' : '—', cls: a.recoveryFactor >= 2 ? 'aa--green' : '', sub: 'Net ÷ max DD' },
          { label: 'Current Balance', value: fmtBal(cur), cls: '', sub: currency },
          { label: 'Skew (P/L)', value: a.institutional?.distribution ? fmtNum(a.institutional.distribution.skewness, 2) : '—', cls: '', sub: 'sample' },
          { label: 'Kurtosis', value: a.institutional?.distribution ? fmtNum(a.institutional.distribution.excessKurtosis, 2) : '—', cls: '', sub: 'excess' },
          { label: 'R σ', value: a.totalTrades >= 2 ? fmtNum(a.rStd, 3) : '—', cls: '', sub: 'R multiples' },
          { label: 'Max win run ($)', value: a.maxConsecWinSum > 0 ? fmtPnl(a.maxConsecWinSum) : '—', cls: 'aa--green', sub: 'Consecutive closes' },
        ].map(({ label, value, cls, sub }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {deferLower ? (
        <div className="aa-grid-2" style={{ marginBottom: 16 }}>
          <div className="aa-card">
            <div className="aa-section-title">Monthly Progression</div>
            <MonthBars byMonth={a.byMonth} />
          </div>

          {projection ? (
            <div className="aa-card">
              <div className="aa-section-title">Compound Projection</div>
              <div style={{ fontSize: '0.74rem', color: 'rgba(235,232,220,0.78)', marginBottom: 14, lineHeight: 1.55 }}>
                Based on avg monthly return of{' '}
                <span style={{ color: projection.avgMonthlyPct >= 0 ? '#f8c37d' : '#9a8f84', fontWeight: 700 }}>
                  {fmtPct(projection.avgMonthlyPct)}%
                </span>
                {' '}applied to current balance.
              </div>
              {[
                { label: '3 Months', value: fmtBal(projection.months3), chg: projection.months3 - cur },
                { label: '6 Months', value: fmtBal(projection.months6), chg: projection.months6 - cur },
                { label: '12 Months', value: fmtBal(projection.months12), chg: projection.months12 - cur },
              ].map(({ label, value, chg }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: '0.76rem', color: 'rgba(240,236,228,0.78)', fontWeight: 600 }}>{label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'rgba(255,255,255,0.94)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                    <div style={{ fontSize: '0.65rem', color: chg >= 0 ? '#f8c37d' : '#9a8f84', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPnl(chg)}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(234,169,96,0.22)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.65rem', color: 'rgba(232,228,218,0.62)', lineHeight: 1.55 }}>
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
      ) : (
        <div className="aa-grid-2" style={{ marginBottom: 16 }}>
          <div className="aa-card aa-skeleton" style={{ minHeight: 180, borderRadius: 12 }} aria-hidden />
          <div className="aa-card aa-skeleton" style={{ minHeight: 180, borderRadius: 12 }} aria-hidden />
        </div>
      )}

      <div className="aa-card" ref={mileRef}>
        {!mileVis ? (
          <div className="aa-skeleton" style={{ minHeight: 220, borderRadius: 12 }} aria-hidden />
        ) : (
          <>
            <div className="aa-section-title-lg" style={{ marginBottom: 14 }}>
              <span className="aa-title-dot" style={{ background: '#c9a05c' }} />
              Growth Milestones
            </div>
            <div className="aa-grid-3" style={{ gap: 8 }}>
              <Milestone icon="fa-chart-line" label="First Profitable Month" value="Complete at least 1 profitable month" achieved={a.byMonth.some(m => m.pnl > 0)} color="#f8c37d" />
              <Milestone icon="fa-fire" label="Win Streak ≥ 3" value={`Best: ${a.maxWinStreak} consecutive wins`} achieved={a.maxWinStreak >= 3} color="#f59e0b" />
              <Milestone icon="fa-trophy" label="+10% Total Return" value={`Current: ${fmtPct(returnPct)}%`} achieved={returnPct >= 10} color="#eaa960" />
              <Milestone icon="fa-shield-alt" label="90% SL Coverage" value={`Current: ${fmtPct(a.pctWithSL)}%`} achieved={a.pctWithSL >= 90} color="#f8c37d" />
              <Milestone icon="fa-bullseye" label="Profit Factor ≥ 2.0" value={`Current: ${a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—'}`} achieved={a.profitFactor >= 2} color="#f8c37d" />
              <Milestone icon="fa-calendar-check" label="3 Consecutive Profit Months" value={`Current: ${a.profitableMonths} months`} achieved={a.profitableMonths >= 3} color="#eaa960" />
              <Milestone icon="fa-percent" label="+25% Total Return" value={`Current: ${fmtPct(returnPct)}%`} achieved={returnPct >= 25} color="#f59e0b" />
              <Milestone icon="fa-star" label="Win Rate ≥ 60%" value={`Current: ${fmtPct(a.winRate)}%`} achieved={a.winRate >= 60} color="#f59e0b" />
              <Milestone icon="fa-gem" label="+50% Total Return" value={`Current: ${fmtPct(returnPct)}%`} achieved={returnPct >= 50} color="#9a8f84" />
            </div>
          </>
        )}
      </div>

    </div>
  );
});

export default function GrowthEngine() {
  const { account, trades, loading, error, activePlatformId, connections } = useAuraAnalysisData();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
      <div className="aa-skeleton aa-skeleton-chart" />
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to track growth' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Link MetaTrader from the Connection Hub to chart growth, returns, and milestone progress against your balance.'
              : 'Growth curves and milestones need closed trades in this date range.'
          }
        />
      </div>
    );
  }

  const currency = account?.currency || 'USD';
  return <GrowthEngineBody currency={currency} />;
}
