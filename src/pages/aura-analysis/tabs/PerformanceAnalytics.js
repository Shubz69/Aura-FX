import React, { useMemo } from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

/* ── SVG mini equity chart ───────────────────────────────── */
function MiniEquity({ curve, height = 100 }) {
  if (!curve || curve.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>No data</div>;
  const W = 600; const H = height;
  const vals = curve.map(p => p.balance);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const range = mx - mn || 1;
  const pad = { t: 8, b: 20, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map(v => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b));
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length-1].toFixed(1)},${H-pad.b} L${xs[0].toFixed(1)},${H-pad.b} Z`;
  const isUp = vals[vals.length - 1] >= vals[0];
  const col = isUp ? '#f8c37d' : '#9a8f84';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="perf-eq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.2" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#perf-eq)" />
      <path d={line} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Monthly bar chart ───────────────────────────────────── */
function MonthlyBars({ byMonth }) {
  if (!byMonth.length) return <div className="aa-empty">No monthly data</div>;
  const maxAbs = Math.max(...byMonth.map(m => Math.abs(m.pnl)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {byMonth.slice(-12).map(m => {
        const w = Math.abs(m.pnl) / maxAbs * 100;
        const label = new Date(m.month + '-15').toLocaleString('en-US', { month: 'short', year: '2-digit' });
        return (
          <div key={m.month} className="aa-bar-row">
            <span className="aa-bar-label">{label}</span>
            <div className="aa-bar-track">
              <div className={`aa-bar-fill ${m.pnl >= 0 ? 'aa-bar-fill--green' : 'aa-bar-fill--red'}`} style={{ width: `${w}%` }} />
            </div>
            <span className={`aa-bar-val ${pnlCls(m.pnl)}`}>{fmtPnl(m.pnl)}</span>
            <span className="aa-bar-meta">{fmtPct(m.winRate)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PerformanceAnalytics() {
  const { analytics: a, trades, loading, error, activePlatformId, connections } = useAuraAnalysis();
  const needsConnection = !connections?.length || !activePlatformId;

  if (loading) return (
    <div className="aa-page">
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}</div>
      <div className="aa-grid-2">{[...Array(2)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-chart" />)}</div>
    </div>
  );

  if (error) return <div className="aa-page"><div className="aa-error"><i className="fas fa-exclamation-circle aa-error-icon" />{error}</div></div>;

  if (!trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="fa-chart-bar"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to view performance' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Sync your MT5 account to unlock win rate, equity trends, and monthly breakdowns.'
              : 'Nothing matched your filters for this date range yet. Try a wider range or wait for closed trades to sync.'
          }
        />
      </div>
    );
  }

  return (
    <div className="aa-page">

      {/* ── KPI row ── */}
      <div className="aa-grid-5" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Trades',  value: a.totalTrades, sub: `${a.wins}W · ${a.losses}L` },
          { label: 'Win Rate',      value: fmtPct(a.winRate), cls: a.winRate >= 50 ? 'aa--green' : 'aa--red' },
          { label: 'Net P/L',       value: fmtPnl(a.totalPnl), cls: pnlCls(a.totalPnl) },
          { label: 'Profit Factor', value: a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—', cls: a.profitFactor >= 1 ? 'aa--green' : 'aa--red' },
          { label: 'Expectancy',    value: a.expectancy !== 0 ? fmtPnl(a.expectancy) : '—', cls: pnlCls(a.expectancy), sub: 'per trade' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {/* ── Equity + Monthly bars ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-chart-wrap">
          <div className="aa-chart-title">Equity Curve</div>
          <MiniEquity curve={a.equityCurve} height={120} />
        </div>
        <div className="aa-card">
          <div className="aa-section-title">Monthly P/L</div>
          <MonthlyBars byMonth={a.byMonth} />
        </div>
      </div>

      {/* ── Instrument breakdown ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Instrument Breakdown</div>
          {a.bySymbol.length === 0 ? <div className="aa-empty">No data</div> : (
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead>
                  <tr><th>Symbol</th><th>Trades</th><th>Win%</th><th>Avg P/L</th><th>P-Factor</th><th>Net P/L</th></tr>
                </thead>
                <tbody>
                  {a.bySymbol.slice(0, 12).map(s => (
                    <tr key={s.pair}>
                      <td style={{ fontWeight: 700 }}>{s.pair}</td>
                      <td className="aa-table-num">{s.trades}</td>
                      <td className={`aa-table-num ${s.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(s.winRate)}</td>
                      <td className={`aa-table-num ${pnlCls(s.avgPnl)}`}>{fmtPnl(s.avgPnl)}</td>
                      <td className={`aa-table-num ${s.pf >= 1 ? 'aa--green' : 'aa--red'}`}>{s.pf > 0 ? fmtNum(s.pf) : '—'}</td>
                      <td className={`aa-table-num ${pnlCls(s.pnl)}`}>{fmtPnl(s.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="aa-card">
          <div className="aa-section-title">Session Analysis</div>
          {a.bySession.length === 0 ? <div className="aa-empty">No data</div> : (
            <>
              <div className="aa-table-wrap" style={{ marginBottom: 14 }}>
                <table className="aa-table">
                  <thead>
                    <tr><th>Session</th><th>Trades</th><th>Win%</th><th>P-Factor</th><th>Net P/L</th></tr>
                  </thead>
                  <tbody>
                    {a.bySession.map(s => (
                      <tr key={s.session}>
                        <td style={{ fontWeight: 700 }}>{s.session}</td>
                        <td className="aa-table-num">{s.trades}</td>
                        <td className={`aa-table-num ${s.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(s.winRate)}</td>
                        <td className={`aa-table-num ${s.pf >= 1 ? 'aa--green' : 'aa--red'}`}>{s.pf > 0 ? fmtNum(s.pf) : '—'}</td>
                        <td className={`aa-table-num ${pnlCls(s.pnl)}`}>{fmtPnl(s.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="aa-section-title" style={{ marginTop: 4 }}>Direction Breakdown</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { key: 'buy',  label: 'Long',  col: '#f8c37d', data: a.byDirection.buy  },
                  { key: 'sell', label: 'Short', col: '#9a8f84', data: a.byDirection.sell },
                ].map(({ key, label, col, data }) => (
                  <div key={key} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: col, marginBottom: 8 }}>{label} ({data.trades})</div>
                    {[
                      { l: 'Win Rate', v: fmtPct(data.winRate), c: data.winRate >= 50 ? '#f8c37d' : '#9a8f84' },
                      { l: 'Net P/L',  v: fmtPnl(data.pnl),          c: data.pnl >= 0 ? '#f8c37d' : '#9a8f84' },
                      { l: 'P-Factor', v: data.pf > 0 ? fmtNum(data.pf) : '—', c: data.pf >= 1 ? '#f8c37d' : '#9a8f84' },
                    ].map(({ l, v, c }) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{l}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Weekday heatmap ── */}
      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title">Weekday Performance</div>
        <div className="aa-wd-grid">
          {a.byWeekday.map(w => (
            <div key={w.day} className={`aa-wd-cell ${w.pnl > 0 ? 'aa-wd-cell--pos' : w.pnl < 0 ? 'aa-wd-cell--neg' : ''}`}>
              <span className="aa-wd-name">{w.day}</span>
              <span className={`aa-wd-pnl ${pnlCls(w.pnl)}`}>{w.trades > 0 ? (w.pnl >= 0 ? '+' : '') + fmtNum(w.pnl, 0) : '—'}</span>
              <span className="aa-wd-count">{w.trades > 0 ? `${w.trades}T · ${fmtPct(w.winRate)}` : '—'}</span>
              {w.trades > 0 && <div className={`aa-wd-bar-mini ${w.pnl >= 0 ? 'aa-wd-bar-mini--pos' : 'aa-wd-bar-mini--neg'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Win / Loss distribution ── */}
      <div className="aa-grid-3">
        {[
          { label: 'Best Trade',  value: fmtPnl(a.bestTrade),  cls: 'aa--green', sub: a.bestTradeFull?.pair },
          { label: 'Worst Trade', value: fmtPnl(a.worstTrade), cls: 'aa--red',   sub: a.worstTradeFull?.pair },
          { label: 'Avg Win / Avg Loss', value: a.avgWin > 0 && a.avgLoss > 0 ? fmtNum(a.avgWin / a.avgLoss) + 'x' : '—', cls: a.avgWin > a.avgLoss ? 'aa--green' : 'aa--red', sub: `${fmtPnl(a.avgWin)} / -$${fmtNum(a.avgLoss)}` },
        ].map(({ label, value, cls, sub }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

    </div>
  );
}
