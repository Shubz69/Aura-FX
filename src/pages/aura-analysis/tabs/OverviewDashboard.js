import React, { useMemo, useState } from 'react';
import { useAuraAnalysis } from '../../../context/AuraAnalysisContext';
import { fmtPnl, fmtPct, fmtNum, fmtDuration } from '../../../lib/aura-analysis/analytics';
import AuraAnalysisEmptyState from '../../../components/aura-analysis/AuraAnalysisEmptyState';
import '../../../styles/aura-analysis/AuraShared.css';

/* ── Helpers ──────────────────────────────────────────────── */
function pnlCls(v) { return v > 0 ? 'aa--green' : v < 0 ? 'aa--red' : 'aa--muted'; }
function fmtBal(v, cur = 'USD') {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v);
}

/* ── SVG equity curve ─────────────────────────────────────── */
function EquityCurve({ curve, height = 140 }) {
  if (!curve || curve.length < 2) return (
    <div className="aa-chart-wrap" style={{ height }}>
      <div className="aa-empty" style={{ padding: '30px 0' }}>No equity data yet</div>
    </div>
  );
  const W = 600; const H = height;
  const vals = curve.map(p => p.balance);
  const mn = Math.min(...vals); const mx = Math.max(...vals);
  const range = mx - mn || 1;
  const pad = { t: 12, b: 24, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map(v => pad.t + (1 - (v - mn) / range) * (H - pad.t - pad.b));
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${H - pad.b} L${xs[0].toFixed(1)},${H - pad.b} Z`;
  const isUp = vals[vals.length - 1] >= vals[0];
  const col = isUp ? '#f8c37d' : '#9a8f84';
  const gradId = `ec-${isUp ? 'g' : 'r'}`;

  return (
    <div className="aa-chart-wrap">
      <div className="aa-chart-title">Equity Curve</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="aa-svg-chart" style={{ height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={col} />
      </svg>
    </div>
  );
}

/* ── Drawdown chart ───────────────────────────────────────── */
function DrawdownChart({ curve, height = 90 }) {
  if (!curve || curve.length < 2) return null;
  const W = 600; const H = height;
  const vals = curve.map(p => p.ddPct);
  const mx = Math.max(...vals, 0.1);
  const pad = { t: 6, b: 18, l: 4, r: 4 };
  const xs = curve.map((_, i) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r));
  const ys = vals.map(v => pad.t + (v / mx) * (H - pad.t - pad.b));
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${H - pad.b} L${xs[0].toFixed(1)},${H - pad.b} Z`;
  return (
    <div className="aa-chart-wrap" style={{ marginTop: 10 }}>
      <div className="aa-chart-title">Drawdown %</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="aa-svg-chart" style={{ height }}>
        <defs>
          <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a8f84" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#9a8f84" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#dd-grad)" />
        <path d={linePath} fill="none" stroke="#9a8f84" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
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

/* ── Main ─────────────────────────────────────────────────── */
export default function OverviewDashboard() {
  const { analytics, account, trades, loading, error, activePlatformId, connections } = useAuraAnalysis();
  const needsConnection = !connections?.length || !activePlatformId;
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [selDay, setSelDay] = useState(null);

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
          icon="fa-plug"
          variant={needsConnection ? 'connect' : 'data'}
          title={needsConnection ? 'Connect MT5 to unlock your dashboard' : 'No account data yet'}
          description={
            needsConnection
              ? 'Link your MetaTrader 5 account from the Connection Hub to sync balance, trades, and analytics.'
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
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{account.name || 'MT5 Account'}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{account.server || account.platform || 'MetaTrader 5'}{account.leverage ? ` · 1:${account.leverage}` : ''}</div>
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

      {/* ── KPI grid (8 cards) ── */}
      <div className="aa-grid-4" style={{ marginBottom: 16 }}>
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

      {/* ── Equity + Risk snapshot ── */}
      <div className="aa-grid-2" style={{ marginBottom: 16 }}>
        <div>
          <EquityCurve curve={a.equityCurve} height={140} />
          <DrawdownChart curve={a.drawdownCurve} height={80} />
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

          {/* Current streak */}
          {a.currentStreak > 0 && (
            <div className={`aa-pill ${a.streakType === 'win' ? 'aa-pill--green' : 'aa-pill--red'}`} style={{ alignSelf: 'flex-start' }}>
              <i className={`fas ${a.streakType === 'win' ? 'fa-fire' : 'fa-snowflake'}`} />
              {a.currentStreak} {a.streakType} streak
            </div>
          )}

          {/* Compliance warnings */}
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

    </div>
  );
}
