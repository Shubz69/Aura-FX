import React, { memo } from 'react';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import {
  AuraEquityAreaChart,
  AuraHourOfDayStrip,
  AuraPnlHistogram,
  AuraRollingExpectancyChart,
  AuraRMultipleHistogram,
  AuraScatterTradePnR,
  AuraPnlDensityLine,
} from '../../../components/aura-analysis/AuraPerformanceCharts';
import { useAuraPerfSection, useIdleDeferredReady, useInViewOnce } from '../auraTabPerf';
import '../../../styles/aura-analysis/AuraShared.css';

function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }

const MonthlyBars = memo(function MonthlyBars({ byMonth }) {
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
});

const PerformanceLowerTables = memo(function PerformanceLowerTables({ a }) {
  return (
    <>
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div className="aa-card">
          <div className="aa-section-title">Instrument Breakdown</div>
          {a.bySymbol.length === 0 ? <div className="aa-empty">No data</div> : (
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead>
                  <tr><th>Symbol</th><th>Trades</th><th>Win%</th><th>Exp</th><th>Avg P/L</th><th>P-Factor</th><th>Net P/L</th></tr>
                </thead>
                <tbody>
                  {a.bySymbol.slice(0, 12).map(s => (
                    <tr key={s.pair}>
                      <td style={{ fontWeight: 700 }}>{s.pair}</td>
                      <td className="aa-table-num">{s.trades}</td>
                      <td className={`aa-table-num ${s.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(s.winRate)}</td>
                      <td className={`aa-table-num ${pnlCls(s.expectancy ?? s.avgPnl)}`}>{fmtPnl(s.expectancy ?? s.avgPnl)}</td>
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
                    <tr><th>Session</th><th>Trades</th><th>Win%</th><th>Exp</th><th>P-Factor</th><th>Net P/L</th></tr>
                  </thead>
                  <tbody>
                    {a.bySession.map(s => (
                      <tr key={s.session}>
                        <td style={{ fontWeight: 700 }}>{s.session}</td>
                        <td className="aa-table-num">{s.trades}</td>
                        <td className={`aa-table-num ${s.winRate >= 50 ? 'aa--green' : 'aa--red'}`}>{fmtPct(s.winRate)}</td>
                        <td className={`aa-table-num ${pnlCls(s.expectancy ?? 0)}`}>{fmtPnl(s.expectancy ?? 0)}</td>
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
                  { key: 'buy', label: 'Long', col: '#f8c37d', data: a.byDirection.buy },
                  { key: 'sell', label: 'Short', col: '#9a8f84', data: a.byDirection.sell },
                ].map(({ key, label, col, data }) => (
                  <div key={key} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: col, marginBottom: 8 }}>{label} ({data.trades})</div>
                    {[
                      { l: 'Win Rate', v: fmtPct(data.winRate), c: data.winRate >= 50 ? '#f8c37d' : '#9a8f84' },
                      { l: 'Net P/L', v: fmtPnl(data.pnl), c: data.pnl >= 0 ? '#f8c37d' : '#9a8f84' },
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

      <div className="aa-grid-3">
        {[
          { label: 'Best Trade', value: fmtPnl(a.bestTrade), cls: 'aa--green', sub: a.bestTradeFull?.pair },
          { label: 'Worst Trade', value: fmtPnl(a.worstTrade), cls: 'aa--red', sub: a.worstTradeFull?.pair },
          { label: 'Avg Win / Avg Loss', value: a.avgWin > 0 && a.avgLoss > 0 ? fmtNum(a.avgWin / a.avgLoss) + 'x' : '—', cls: a.avgWin > a.avgLoss ? 'aa--green' : 'aa--red', sub: `${fmtPnl(a.avgWin)} / -$${fmtNum(a.avgLoss)}` },
        ].map(({ label, value, cls, sub }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>
    </>
  );
});

const PerformanceAnalyticsBody = memo(function PerformanceAnalyticsBody() {
  const { analytics: a, analyticsDataKey } = useAuraAnalysisMetrics();
  useAuraPerfSection('PerformanceAnalytics.body');
  const deferHeavyCharts = useIdleDeferredReady(analyticsDataKey || '');
  const [lowerRef, lowerVis] = useInViewOnce({ rootMargin: '240px' });

  return (
    <div className="aa-page">

      <div className="aa-grid-5" style={{ marginBottom: 12 }}>
        {[
          { label: 'Total Trades', value: a.totalTrades, sub: `${a.wins}W · ${a.losses}L` },
          { label: 'Win Rate', value: fmtPct(a.winRate), cls: a.winRate >= 50 ? 'aa--green' : 'aa--red' },
          { label: 'Net P/L', value: fmtPnl(a.totalPnl), cls: pnlCls(a.totalPnl) },
          { label: 'Profit Factor', value: a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—', cls: a.profitFactor >= 1 ? 'aa--green' : 'aa--red' },
          { label: 'Expectancy', value: a.expectancy !== 0 ? fmtPnl(a.expectancy) : '—', cls: pnlCls(a.expectancy), sub: 'per trade' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div>
          <AuraEquityAreaChart curve={a.equityCurve} height={132} title="Equity curve" />
          <div className="aa-section-title" style={{ margin: '12px 0 8px' }}>Intraday footprint (UTC)</div>
          <AuraHourOfDayStrip byHourUtc={a.byHourUtc} />
          <div className="aa-section-title" style={{ margin: '14px 0 8px' }}>P/L histogram</div>
          {deferHeavyCharts ? (
            <AuraPnlHistogram bins={a.pnlHistogram} height={100} />
          ) : (
            <div className="aa-skeleton aa-skeleton-chart" style={{ height: 100 }} aria-hidden />
          )}
          {a.institutional?.distribution?.pnlDensityCurve?.length > 0 && (
            deferHeavyCharts ? (
              <AuraPnlDensityLine curve={a.institutional.distribution.pnlDensityCurve} height={86} stableKey={a.institutionalInputFingerprint} />
            ) : (
              <div className="aa-skeleton aa-skeleton-chart" style={{ height: 86 }} aria-hidden />
            )
          )}
          {a.institutional?.rollingExpectancy?.series?.length > 0 && (
            deferHeavyCharts ? (
              <AuraRollingExpectancyChart series={a.institutional.rollingExpectancy.series} height={92} title="Rolling expectancy" />
            ) : (
              <div className="aa-skeleton aa-skeleton-chart" style={{ height: 92 }} aria-hidden />
            )
          )}
          {a.institutional?.rMultipleDistribution?.bins?.length > 0 && (
            deferHeavyCharts ? (
              <AuraRMultipleHistogram bins={a.institutional.rMultipleDistribution.bins} height={92} />
            ) : (
              <div className="aa-skeleton aa-skeleton-chart" style={{ height: 92 }} aria-hidden />
            )
          )}
          {a.institutional?.scatterTradePnL?.length > 0 && (
            deferHeavyCharts ? (
              <AuraScatterTradePnR points={a.institutional.scatterTradePnL} height={110} />
            ) : (
              <div className="aa-skeleton aa-skeleton-chart" style={{ height: 110 }} aria-hidden />
            )
          )}
        </div>
        <div className="aa-card">
          <div className="aa-section-title">Monthly P/L</div>
          <MonthlyBars byMonth={a.byMonth} />
        </div>
      </div>

      <div className="aa-grid-5" style={{ marginBottom: 16 }}>
        {[
          { label: 'Recovery F.', value: a.recoveryFactor > 0 && a.recoveryFactor < 900 ? fmtNum(a.recoveryFactor, 2) : a.recoveryFactor >= 900 ? '∞' : '—', cls: a.recoveryFactor >= 2 ? 'aa--green' : '', sub: 'Net ÷ max DD' },
          { label: 'Calmar', value: a.calmarRatio > 0 ? fmtNum(a.calmarRatio, 2) : '—', cls: a.calmarRatio >= 1.5 ? 'aa--green' : '', sub: 'CAGR ÷ DD%' },
          { label: 'SQN', value: fmtNum(a.sqn, 2), cls: a.sqn >= 3 ? 'aa--green' : '', sub: `${a.totalTrades} trades` },
          { label: 'σ P/L', value: a.pnlStdDev > 0 ? fmtNum(a.pnlStdDev, 2) : '—', cls: '', sub: 'Dispersion' },
          { label: 'Ret / DD', value: a.returnToMaxDrawdown > 0 ? fmtNum(a.returnToMaxDrawdown, 2) : '—', cls: '', sub: 'Total % ÷ max DD%' },
          { label: 'Skew', value: a.institutional?.distribution ? fmtNum(a.institutional.distribution.skewness, 2) : '—', cls: '', sub: 'P/L' },
          { label: 'Kurtosis', value: a.institutional?.distribution ? fmtNum(a.institutional.distribution.excessKurtosis, 2) : '—', cls: '', sub: 'excess' },
          { label: 'R σ', value: a.totalTrades >= 2 ? fmtNum(a.rStd, 3) : '—', cls: '', sub: 'R multiples' },
          { label: 'Max win run ($)', value: a.maxConsecWinSum > 0 ? fmtPnl(a.maxConsecWinSum) : '—', cls: 'aa--green', sub: 'Consecutive closes' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {a.institutional?.distribution?.pnlQuantiles && a.totalTrades > 0 && (
        <div className="aa-card" style={{ marginBottom: 16 }}>
          <div className="aa-section-title">Realized P/L quantiles</div>
          <div className="aa-grid-5">
            {[
              { k: 'p1', label: 'P1' },
              { k: 'p5', label: 'P5' },
              { k: 'p50', label: 'P50' },
              { k: 'p95', label: 'P95' },
              { k: 'p99', label: 'P99' },
            ].map(({ k, label }) => {
              const raw = a.institutional.distribution.pnlQuantiles[k];
              const v = raw != null && Number.isFinite(Number(raw)) ? fmtPnl(Number(raw)) : '—';
              return (
                <div key={k} className="aa-kpi">
                  <span className="aa-kpi-label">{label}</span>
                  <span className="aa-kpi-value">{v}</span>
                  <span className="aa-kpi-sub">Per trade $</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div ref={lowerRef}>
        {!lowerVis ? (
          <>
            <div className="aa-grid-2" style={{ marginBottom: 16 }}>
              <div className="aa-card aa-skeleton" style={{ minHeight: 220, borderRadius: 12 }} aria-hidden />
              <div className="aa-card aa-skeleton" style={{ minHeight: 220, borderRadius: 12 }} aria-hidden />
            </div>
            <div className="aa-card aa-skeleton" style={{ minHeight: 140, marginBottom: 16, borderRadius: 12 }} aria-hidden />
            <div className="aa-grid-3">
              {[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}
            </div>
          </>
        ) : (
          <PerformanceLowerTables a={a} />
        )}
      </div>

    </div>
  );
});

export default function PerformanceAnalytics() {
  const { trades, loading, error, activePlatformId, connections } = useAuraAnalysisData();
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
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect to view performance' : 'No trades in this period'}
          description={
            needsConnection
              ? 'Connect MetaTrader from the Connection Hub to unlock win rate, equity trends, and monthly breakdowns.'
              : 'Nothing matched your filters for this date range yet. Try a wider range or refresh after new closed trades.'
          }
        />
      </div>
    );
  }

  return <PerformanceAnalyticsBody />;
}
