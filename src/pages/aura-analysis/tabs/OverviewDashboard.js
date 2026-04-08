import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuraAnalysisData, useAuraAnalysisMetrics } from '../../../context/AuraAnalysisContext';
import { useReplayContributionProfile } from '../../../hooks/useReplayContributionProfile';
import { fmtPnl, fmtPct, fmtNum, fmtDuration } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import AuraDnaOverviewCard from '../../../components/aura-analysis/AuraDnaOverviewCard';
import {
  AuraEquityAreaChart,
  AuraDrawdownAreaChart,
  AuraHourOfDayStrip,
  AuraPnlHistogram,
  AuraRollingExpectancyChart,
  AuraPnlDensityLine,
} from '../../../components/aura-analysis/AuraPerformanceCharts';
import '../../../styles/aura-analysis/AuraShared.css';

/* ── Helpers ──────────────────────────────────────────────── */
function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }
function fmtBal(v, cur = 'USD') {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v);
}

/* ── Score ring ───────────────────────────────────────────── */
function ScoreRing({ score, label, color }) {
  const r = 38; const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  return (
    <div className="aa-score-ring-wrap">
      <div className="aa-score-ring">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50px 50px', transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="aa-score-ring-val">
          <span className="aa-score-num">{score}</span>
          <span className="aa-score-label-sm">/100</span>
        </div>
      </div>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

/* ── Loading skeleton ─────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="aa-page" style={{ padding: '12px 0' }}>
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>
        {[...Array(8)].map((_, i) => <div key={i} className="aa-skeleton aa-skeleton-kpi" />)}
      </div>
      <div className="aa-grid-2" style={{ marginBottom: 12 }}>
        <div className="aa-skeleton aa-skeleton-chart" />
        <div className="aa-skeleton aa-skeleton-chart" />
      </div>
      <div className="aa-grid-3">
        {[...Array(3)].map((_, i) => <div key={i} className="aa-skeleton" style={{ height: 120, borderRadius: 12 }} />)}
      </div>
    </div>
  );
}

function metaTraderLine(account, activePlatformId) {
  const p = String(account?.platform || '');
  if (/^MT4\b/i.test(p)) return 'MetaTrader 4';
  if (/^MT5\b/i.test(p)) return 'MetaTrader 5';
  if (activePlatformId === 'mt4') return 'MetaTrader 4';
  if (activePlatformId === 'mt5') return 'MetaTrader 5';
  return 'MetaTrader';
}

/* ── Main ─────────────────────────────────────────────────── */
function useIdleDeferredCharts(dataKey) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    let cancelled = false;
    const markReady = () => { if (!cancelled) setReady(true); };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(markReady, { timeout: 420 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(markReady, 32);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [dataKey]);
  return ready;
}

export default function OverviewDashboard() {
  const { account, trades, loading, error, activePlatformId, connections } = useAuraAnalysisData();
  const { analytics, analyticsDataKey } = useAuraAnalysisMetrics();
  const { scoreSurface } = useReplayContributionProfile();
  const needsConnection = !connections?.length || !activePlatformId;
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [selDay, setSelDay] = useState(null);

  const deferHeavyCharts = useIdleDeferredCharts(analyticsDataKey || '');

  const currency = account?.currency || 'USD';

  /* Calendar */
  const calData = useMemo(() => {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const first = new Date(y, m, 1).getDay();
    const last = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= last; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = analytics.byDay?.[key];
      cells.push({ d, key, pnl: dayData?.pnl ?? null, count: dayData?.trades?.length ?? 0 });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth, analytics.byDay]);

  const calLabel = calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const selDayTrades = selDay ? (analytics.byDay?.[selDay]?.trades || []) : [];

  if (loading) return <LoadingSkeleton />;

  if (error) return (
    <div className="aa-page">
      <div className="aa-error">
        <i className="fas fa-exclamation-circle aa-error-icon" />
        {error}
      </div>
    </div>
  );

  if (!account && !trades.length) {
    return (
      <div className="aa-page">
        <AuraAnalysisEmptyState
          icon="mt5"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect MetaTrader to unlock your dashboard' : 'No account data yet'}
          description={
            needsConnection
              ? 'Link MetaTrader 4 or 5 from the Connection Hub using read-only investor access to load balance, trades, and analytics.'
              : 'We could not load account details. Try refreshing, or reconnect from the Connection Hub.'
          }
        />
      </div>
    );
  }

  const a = analytics;

  return (
    <div className="aa-page">

      {/* ── Account banner ── */}
      {account && (
        <div className="aa-card aa-card--accent" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(234,169,96,0.18)', border: '1px solid rgba(234,169,96,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
              <i className="fas fa-chart-line" style={{ color: '#fcd9a8' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{account.name || 'Trading account'}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{account.server || metaTraderLine(account, activePlatformId)}{account.leverage ? ` · 1:${account.leverage}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginLeft: 'auto' }}>
            {[
              { label: 'Balance', value: fmtBal(account.balance, currency) },
              { label: 'Equity',  value: fmtBal(account.equity,  currency) },
              { label: 'Free Margin', value: fmtBal(account.freeMargin, currency) },
              { label: 'Margin Level', value: account.marginLevel != null ? fmtNum(account.marginLevel, 1) + '%' : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </div>
            ))}
          </div>
          {a.totalTrades > 0 && (
            <span className={`aa-pill ${a.totalPnl >= 0 ? 'aa-pill--green' : 'aa-pill--red'}`}>
              {fmtPnl(a.totalPnl)} net
            </span>
          )}
        </div>
      )}

      {/* ── Equity + risk charts first (scroll priority) ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div>
          <AuraEquityAreaChart curve={a.equityCurve} height={150} title="Equity curve" />
          <AuraDrawdownAreaChart curve={a.drawdownCurve} height={92} title="Underwater drawdown %" />
          {a.totalTrades > 0 && (
            <>
              <div className="aa-section-title" style={{ margin: '14px 0 8px' }}>When you trade (UTC)</div>
              <AuraHourOfDayStrip byHourUtc={a.byHourUtc} />
              <div className="aa-section-title" style={{ margin: '16px 0 8px' }}>Realized P/L distribution</div>
              {deferHeavyCharts ? (
                <AuraPnlHistogram bins={a.pnlHistogram} height={112} />
              ) : (
                <div className="aa-skeleton aa-skeleton-chart" style={{ height: 112 }} aria-hidden />
              )}
              {a.institutional?.rollingExpectancy?.series?.length > 0 && (
                <div className="aa-section-title" style={{ margin: '14px 0 8px' }}>Rolling expectancy</div>
              )}
              {a.institutional?.rollingExpectancy?.series?.length > 0 && (
                deferHeavyCharts ? (
                  <AuraRollingExpectancyChart
                    series={a.institutional.rollingExpectancy.series}
                    height={96}
                    title=""
                  />
                ) : (
                  <div className="aa-skeleton aa-skeleton-chart" style={{ height: 96 }} aria-hidden />
                )
              )}
              {a.institutional?.distribution?.pnlDensityCurve?.length > 0 && (
                deferHeavyCharts ? (
                  <AuraPnlDensityLine curve={a.institutional.distribution.pnlDensityCurve} height={88} stableKey={a.institutionalInputFingerprint} />
                ) : (
                  <div className="aa-skeleton aa-skeleton-chart" style={{ height: 88 }} aria-hidden />
                )
              )}
            </>
          )}
        </div>

        <div className="aa-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="aa-section-title">Risk Snapshot</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <ScoreRing
              score={a.riskScore}
              label={a.riskLabel}
              color={a.riskScore < 25 ? '#f8c37d' : a.riskScore < 50 ? '#c9a05c' : '#9a8f84'}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              {[
                { label: 'Current DD',  value: fmtPct(a.currentDrawdownPct), col: a.currentDrawdownPct > 10 ? 'var(--red)' : 'rgba(255,255,255,0.75)' },
                { label: 'Max DD',      value: fmtPct(a.maxDrawdownPct),     col: a.maxDrawdownPct > 20 ? 'var(--red)' : 'rgba(255,255,255,0.75)' },
                { label: 'Win Streak',  value: `${a.maxWinStreak}`,          col: '#f8c37d' },
                { label: 'Loss Streak', value: `${a.maxLossStreak}`,          col: a.maxLossStreak >= 5 ? 'var(--red)' : 'rgba(255,255,255,0.75)' },
                { label: 'SL Usage',    value: fmtPct(a.pctWithSL),          col: a.pctWithSL < 70 ? 'var(--amber)' : '#f8c37d' },
                { label: 'TP Usage',    value: fmtPct(a.pctWithTP),          col: 'rgba(255,255,255,0.75)' },
              ].map(({ label, value, col }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {a.currentStreak > 0 && (
            <div className={`aa-pill ${a.streakType === 'win' ? 'aa-pill--green' : 'aa-pill--red'}`} style={{ alignSelf: 'flex-start' }}>
              <i className={`fas ${a.streakType === 'win' ? 'fa-fire' : 'fa-snowflake'}`} />
              {a.currentStreak} {a.streakType} streak
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {a.maxDrawdownPct > 20 && (
              <div className="aa-warning aa-warning--red">
                <i className="fas fa-exclamation-triangle aa-warning-icon" style={{ color: '#9a8f84' }} />
                Max drawdown {fmtPct(a.maxDrawdownPct)} — review risk management
              </div>
            )}
            {a.pctWithSL < 70 && a.totalTrades > 0 && (
              <div className="aa-warning">
                <i className="fas fa-shield-alt aa-warning-icon" style={{ color: '#c9a05c' }} />
                Only {fmtPct(a.pctWithSL)} of trades have a stop loss
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI grid (8 cards) ── */}
      <div className="aa-grid-4" style={{ marginBottom: 12 }}>
        {[
          { label: 'Total Trades',   value: a.totalTrades, sub: `${a.wins}W · ${a.losses}L` },
          { label: 'Win Rate',       value: fmtPct(a.winRate), cls: a.winRate >= 50 ? 'aa--green' : 'aa--red', sub: `${a.wins} wins` },
          { label: 'Net P/L',        value: fmtPnl(a.totalPnl), cls: pnlCls(a.totalPnl), sub: `${a.totalTrades} trades` },
          { label: 'Profit Factor',  value: a.profitFactor > 0 ? fmtNum(a.profitFactor) : '—', cls: a.profitFactor >= 1 ? 'aa--green' : 'aa--red', sub: 'GP / GL' },
          { label: 'Expectancy',     value: a.expectancy !== 0 ? fmtPnl(a.expectancy) : '—', cls: pnlCls(a.expectancy), sub: 'per trade' },
          { label: 'Avg Win',        value: a.avgWin > 0 ? fmtPnl(a.avgWin) : '—', cls: 'aa--green', sub: `${a.wins} trades` },
          { label: 'Avg Loss',       value: a.avgLoss > 0 ? '-$' + fmtNum(a.avgLoss) : '—', cls: 'aa--red', sub: `${a.losses} trades` },
          { label: 'Max Drawdown',   value: a.maxDrawdownPct > 0 ? fmtPct(a.maxDrawdownPct) : '—', cls: a.maxDrawdownPct > 15 ? 'aa--red' : a.maxDrawdownPct > 8 ? 'aa--amber' : 'aa--green', sub: '-$' + fmtNum(a.maxDrawdown) },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className="aa-kpi">
            <span className="aa-kpi-label">{label}</span>
            <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
            {sub && <span className="aa-kpi-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {a.totalTrades > 0 && (
        <div className="aa-grid-4" style={{ marginBottom: 16 }}>
          {[
            { label: 'Recovery factor', value: a.recoveryFactor > 0 && a.recoveryFactor < 900 ? fmtNum(a.recoveryFactor, 2) : a.recoveryFactor >= 900 ? '∞' : '—', cls: a.recoveryFactor >= 2 ? 'aa--green' : 'aa--muted', sub: 'Net ÷ max DD $' },
            { label: 'Calmar (est.)', value: a.calmarRatio > 0 ? fmtNum(a.calmarRatio, 2) : '—', cls: a.calmarRatio >= 1 ? 'aa--green' : 'aa--muted', sub: 'CAGR ÷ max DD %' },
            { label: 'SQN (R-based)', value: a.totalTrades >= 2 ? fmtNum(a.sqn, 2) : '—', cls: a.sqn >= 3 ? 'aa--green' : a.sqn >= 1.6 ? 'aa--amber' : '', sub: 'Van Tharp style' },
            { label: 'Avg R / trade', value: a.expectancyR !== 0 ? fmtNum(a.expectancyR, 2) : '—', cls: pnlCls(a.expectancyR), sub: '1R = avg loss' },
            { label: 'Payoff ratio', value: a.payoffRatio > 0 ? fmtNum(a.payoffRatio, 2) + 'x' : '—', cls: a.payoffRatio >= 1 ? 'aa--green' : 'aa--red', sub: 'Avg win ÷ avg loss' },
            { label: 'Sharpe (trade)', value: a.sharpeLike !== 0 ? fmtNum(a.sharpeLike, 2) : '—', cls: '', sub: 'Mean ÷ σ P/L' },
            { label: 'Sortino (trade)', value: a.sortinoLike !== 0 ? fmtNum(a.sortinoLike, 2) : '—', cls: '', sub: 'Mean ÷ downside σ' },
            { label: 'Full Kelly (est.)', value: a.kellyOptimalFraction !== 0 ? fmtPct(Math.abs(a.kellyOptimalFraction) * 100, 1) : '—', cls: Math.abs(a.kellyOptimalFraction) > 0.2 ? 'aa--amber' : 'aa--muted', sub: 'Theoretical max / trade' },
          ].map(({ label, value, sub, cls }) => (
            <div key={label} className="aa-kpi">
              <span className="aa-kpi-label">{label}</span>
              <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
              {sub && <span className="aa-kpi-sub">{sub}</span>}
            </div>
          ))}
        </div>
      )}

      {a.totalTrades > 0 && (
        <div className="aa-grid-4" style={{ marginBottom: 16 }}>
          {[
            { label: 'R σ (multiples)', value: a.totalTrades >= 2 ? fmtNum(a.rStd, 3) : '—', cls: '', sub: 'R-multiple dispersion' },
            { label: 'Max win run ($)', value: a.maxConsecWinSum > 0 ? fmtPnl(a.maxConsecWinSum) : '—', cls: 'aa--green', sub: 'Consecutive closes' },
            { label: 'CAGR (est.)', value: a.periodYears > 0.05 ? fmtPct(a.cagrPct) : '—', cls: a.cagrPct >= 0 ? 'aa--green' : 'aa--red', sub: 'From trade span' },
            { label: 'Ret / DD', value: a.returnToMaxDrawdown > 0 ? fmtNum(a.returnToMaxDrawdown, 2) : '—', cls: '', sub: 'Total % ÷ max DD%' },
          ].map(({ label, value, sub, cls }) => (
            <div key={label} className="aa-kpi">
              <span className="aa-kpi-label">{label}</span>
              <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
              {sub && <span className="aa-kpi-sub">{sub}</span>}
            </div>
          ))}
        </div>
      )}

      {a.totalTrades > 0 && a.institutional && (
        <div className="aa-card" style={{ marginBottom: 16 }}>
          <div className="aa-section-title">Institutional signature</div>
          <div className="aa-grid-4" style={{ marginBottom: 4 }}>
            {[
              { label: 'Aurax composite', value: String(a.institutional.signature?.auraxComposite ?? '—'), sub: '/100', cls: (a.institutional.signature?.auraxComposite ?? 0) >= 60 ? 'aa--green' : '' },
              { label: 'Edge confidence', value: String(a.institutional.signature?.edgeConfidenceScore ?? '—'), sub: '/100', cls: '' },
              { label: 'Consistency', value: String(a.institutional.signature?.consistencyScore ?? '—'), sub: '/100', cls: '' },
              { label: 'Adaptability', value: String(a.institutional.signature?.adaptabilityScore ?? '—'), sub: '/100', cls: '' },
              { label: 'Edge stability', value: String(a.institutional.edgeStabilityScore ?? '—'), sub: '/100', cls: '' },
              { label: 'Hist. VaR 95%', value: fmtPnl(a.institutional.riskEngine?.historicalVaR95 ?? 0), cls: 'aa--red', sub: 'per trade' },
              { label: 'CVaR 95%', value: fmtPnl(a.institutional.riskEngine?.historicalCVaR95 ?? 0), cls: 'aa--red', sub: 'expected shortfall' },
              { label: 'MC ruin ≈', value: a.institutional.riskEngine?.monteCarlo?.ruinProbApprox != null ? fmtPct(a.institutional.riskEngine.monteCarlo.ruinProbApprox * 100, 1) : '—', cls: '', sub: `${a.institutional.riskEngine?.monteCarlo?.runs ?? 0} paths` },
            ].map(({ label, value, sub, cls }) => (
              <div key={label} className="aa-kpi">
                <span className="aa-kpi-label">{label}</span>
                <span className={`aa-kpi-value ${cls || ''}`}>{value}</span>
                {sub && <span className="aa-kpi-sub">{sub}</span>}
              </div>
            ))}
          </div>
          {scoreSurface.visible && (
            <div className="aa-replay-score-surface" aria-label="Replay-derived profile signal">
              <div className="aa-replay-score-surface__head">
                <span className="aa-replay-score-surface__label">Replay-derived signal</span>
                <span
                  className={
                    scoreSurface.chipText === 'Watch'
                      ? 'aa-replay-score-surface__chip aa-replay-score-surface__chip--watch'
                      : 'aa-replay-score-surface__chip'
                  }
                >
                  {scoreSurface.chipText}
                </span>
                {scoreSurface.trendChip && (
                  <span className="aa-replay-score-surface__trend">{scoreSurface.trendChip}</span>
                )}
              </div>
              <p className="aa-replay-score-surface__line">{scoreSurface.supportingLine}</p>
              <div className="aa-replay-score-surface__foot">
                <span className="aa-replay-score-surface__disclaimer">{scoreSurface.disclaimer}</span>
                <Link className="aa-replay-score-surface__link" to={scoreSurface.moreHref}>
                  {scoreSurface.moreLabel}
                </Link>
              </div>
            </div>
          )}
          {a.institutional.edgeDecay?.decayFlag && (
            <div className="aa-warning" style={{ marginTop: 8 }}>
              <i className="fas fa-chart-line aa-warning-icon" style={{ color: '#c9a05c' }} />
              Edge decay detected — second-half expectancy vs first-half is materially lower.
            </div>
          )}
        </div>
      )}

      {/* ── Session · Direction · Top Symbols ── */}
      <div className="aa-grid-3" style={{ marginBottom: 16 }}>

        {/* Session performance */}
        <div className="aa-card">
          <div className="aa-section-title">Session Performance</div>
          {a.bySession.length === 0 ? (
            <div className="aa-empty">No session data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {a.bySession.slice(0, 5).map(s => {
                const maxAbs = Math.max(...a.bySession.map(x => Math.abs(x.pnl)), 1);
                const w = Math.abs(s.pnl) / maxAbs * 100;
                return (
                  <div key={s.session} className="aa-bar-row">
                    <span className="aa-bar-label" style={{ width: 90 }}>{s.session}</span>
                    <div className="aa-bar-track">
                      <div className={`aa-bar-fill ${s.pnl >= 0 ? 'aa-bar-fill--green' : 'aa-bar-fill--red'}`} style={{ width: `${w}%` }} />
                    </div>
                    <span className={`aa-bar-val ${pnlCls(s.pnl)}`}>{fmtPnl(s.pnl)}</span>
                    <span className="aa-bar-meta">{fmtPct(s.winRate)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Direction breakdown */}
        <div className="aa-card">
          <div className="aa-section-title">Direction Breakdown</div>
          {[
            { key: 'buy',  icon: 'fa-arrow-up',   label: 'Long',  col: '#f8c37d', data: a.byDirection.buy  },
            { key: 'sell', icon: 'fa-arrow-down',  label: 'Short', col: '#9a8f84', data: a.byDirection.sell },
          ].map(({ key, icon, label, col, data }) => (
            <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: col + '18', border: `1px solid ${col}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`fas ${icon}`} style={{ color: col, fontSize: '0.7rem' }} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>{data.trades} trades</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {[
                  { l: 'Win Rate', v: fmtPct(data.winRate), c: data.winRate >= 50 ? '#f8c37d' : '#9a8f84' },
                  { l: 'Net P/L',  v: fmtPnl(data.pnl),    c: data.pnl >= 0 ? '#f8c37d' : '#9a8f84' },
                  { l: 'P-Factor', v: data.pf > 0 ? fmtNum(data.pf) : '—', c: data.pf >= 1 ? '#f8c37d' : '#9a8f84' },
                ].map(({ l, v, c }) => (
                  <div key={l}>
                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Top symbols */}
        <div className="aa-card">
          <div className="aa-section-title">Top Instruments</div>
          {a.bySymbol.length === 0 ? (
            <div className="aa-empty">No symbol data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {a.bySymbol.slice(0, 6).map((s, idx) => (
                <div key={s.pair} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: idx < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.2)', width: 14, textAlign: 'right' }}>{idx + 1}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', flex: 1 }}>{s.pair}</span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{s.trades}T</span>
                  <span style={{ fontSize: '0.65rem', color: s.winRate >= 50 ? '#f8c37d' : '#9a8f84' }}>{fmtPct(s.winRate)}</span>
                  <span className={`${pnlCls(s.pnl)}`} style={{ fontSize: '0.72rem', fontWeight: 700, width: 76, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(s.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Calendar + Insights ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>

        {/* Monthly calendar */}
        <div className="aa-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>‹</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{calLabel}</span>
            <button type="button" onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 6 }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.22)', padding: '2px 0', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {calData.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const isToday = cell.key === new Date().toISOString().slice(0, 10);
              const isSel = selDay === cell.key;
              return (
                <button key={cell.key} type="button" onClick={() => setSelDay(p => p === cell.key ? null : cell.key)}
                  style={{
                    background: isSel ? 'rgba(234,169,96,0.26)' : cell.pnl == null ? 'rgba(255,255,255,0.02)' : cell.pnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${isSel ? 'rgba(234,169,96,0.55)' : isToday ? 'rgba(234,169,96,0.35)' : cell.pnl == null ? 'rgba(255,255,255,0.06)' : cell.pnl >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 6, padding: '4px 2px 3px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: isToday ? 700 : 400, color: isToday ? '#fcd9a8' : 'rgba(255,255,255,0.65)' }}>{cell.d}</div>
                  {cell.pnl != null && (
                    <div style={{ fontSize: '0.52rem', fontWeight: 700, color: cell.pnl >= 0 ? '#f8c37d' : '#9a8f84', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {cell.pnl >= 0 ? '+' : ''}{cell.pnl >= 1000 || cell.pnl <= -1000 ? fmtNum(cell.pnl / 1000, 1) + 'k' : fmtNum(cell.pnl, 0)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {selDay && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                  {new Date(selDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <button type="button" onClick={() => setSelDay(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.9rem' }}>×</button>
              </div>
              {selDayTrades.length === 0 ? (
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>No trades</div>
              ) : selDayTrades.map((t, idx) => (
                <div key={t.id || idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{t.pair || '—'}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: (Number(t.pnl) || 0) >= 0 ? '#f8c37d' : '#9a8f84', fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(t.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="aa-card">
          <div className="aa-section-title-lg">
            <span className="aa-title-dot" />
            Aura Insights
          </div>
          {a.insights.length === 0 ? (
            <div className="aa-empty">
              <div className="aa-empty-icon"><i className="fas fa-lightbulb" /></div>
              Trade more to unlock AI-powered insights.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {a.insights.map((ins, i) => (
                <div key={i} className="aa-insight">
                  <div className="aa-insight-dot" />
                  <span>{ins}</span>
                </div>
              ))}
            </div>
          )}

          {/* Weekday heatmap strip */}
          {a.totalTrades > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="aa-section-title" style={{ marginBottom: 8 }}>Performance by Day</div>
              <div className="aa-wd-grid">
                {a.byWeekday.filter(w => w.dayIndex !== 0 && w.dayIndex !== 6).map(w => (
                  <div key={w.day} className={`aa-wd-cell ${w.pnl > 0 ? 'aa-wd-cell--pos' : w.pnl < 0 ? 'aa-wd-cell--neg' : ''}`}>
                    <span className="aa-wd-name">{w.day}</span>
                    <span className={`aa-wd-pnl ${pnlCls(w.pnl)}`}>{w.trades > 0 ? (w.pnl >= 0 ? '+' : '') + fmtNum(w.pnl, 0) : '—'}</span>
                    <span className="aa-wd-count">{w.trades}T</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent trades ── */}
      <div className="aa-card">
        <div className="aa-section-title-lg" style={{ marginBottom: 12 }}>
          <span className="aa-title-dot" />
          Recent Trades
          <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>{trades.length} total</span>
        </div>
        {trades.length === 0 ? (
          <div className="aa-empty">No trades in the selected period</div>
        ) : (
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead>
                <tr>
                  <th>Symbol</th><th>Dir</th><th>Open</th><th>Close</th>
                  <th>Lots</th><th>Entry</th><th>Exit</th><th>Session</th><th>P/L</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().slice(0, 20).map((t, i) => {
                  const p = Number(t.pnl) || 0;
                  const fmt = d => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
                  return (
                    <tr key={t.id || i}>
                      <td style={{ fontWeight: 700 }}>{t.pair || '—'}</td>
                      <td>
                        <span className={`aa-pill aa-pill--${(t.direction || '').toLowerCase() === 'buy' ? 'green' : 'red'}`} style={{ fontSize: '0.58rem' }}>
                          {(t.direction || '—').toUpperCase()}
                        </span>
                      </td>
                      <td className="aa-table-num" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>{fmt(t.openTime)}</td>
                      <td className="aa-table-num" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>{fmt(t.closeTime)}</td>
                      <td className="aa-table-num">{t.volume != null ? fmtNum(t.volume, 2) : '—'}</td>
                      <td className="aa-table-num">{t.entryPrice > 0 ? fmtNum(t.entryPrice, 5) : '—'}</td>
                      <td className="aa-table-num">{t.closePrice > 0 ? fmtNum(t.closePrice, 5) : '—'}</td>
                      <td><span className="aa-pill aa-pill--dim" style={{ fontSize: '0.58rem' }}>{t.session || '—'}</span></td>
                      <td className={`aa-table-num ${pnlCls(p)}`}>{fmtPnl(p)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AuraDnaOverviewCard />

      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title">Trading suite (journal · replay · research)</div>
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.42)', margin: '0 0 12px', lineHeight: 1.55, maxWidth: 720 }}>
          Parity with all-in-one journals: link MetaTrader analytics here to depth tools — daily diary, validator trade log
          (custom columns and CSV export), session replay, playbooks, backtests, and cross-platform DNA reports.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { to: '/journal', label: 'Daily journal', sub: 'Notes, mood, tasks' },
            { to: '/trader-deck/trade-validator/journal', label: 'Trade log', sub: 'Rows, filters, export' },
            { to: '/aura-analysis/dashboard/trader-replay', label: 'Trader Replay', sub: 'Session review' },
            { to: '/trader-deck/trade-validator/trader-playbook', label: 'Playbook', sub: 'Setups & rules' },
            { to: '/backtesting', label: 'Backtesting', sub: 'Sessions & reports' },
            { to: '/reports/live', label: 'Live analytics', sub: 'Reports hub index' },
            { to: '/reports/dna', label: 'Reports / DNA', sub: 'Cross-product insights' },
            { to: '/manual-metrics', label: 'Manual / CSV', sub: 'Broker uploads' },
            { to: '/trader-deck/trade-validator/analytics', label: 'Deck analytics', sub: 'Validator KPIs' },
          ].map(({ to, label, sub }) => (
            <Link
              key={to}
              to={to}
              className="aa-pill"
              style={{
                textDecoration: 'none',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(212,175,55,0.28)',
                background: 'rgba(255,255,255,0.03)',
                minWidth: 140,
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f8c37d' }}>{label}</span>
              <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>{sub}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
