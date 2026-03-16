import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../../services/Api';
import { useAuraConnection } from '../../../context/AuraConnectionContext';
import '../../../styles/aura-analysis/PerformanceAnalytics.css';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtPnl(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

function buildEquityCurve(trades, start = 10000) {
  const sorted = [...trades].sort((a, b) => new Date(a.closeTime || a.openTime || a.date || 0) - new Date(b.closeTime || b.openTime || b.date || 0));
  let eq = start;
  return [{ eq: start, label: 'Start' }, ...sorted.map((t) => {
    eq += Number(t.pnl) || 0;
    const d = t.closeTime || t.openTime || t.date;
    return { eq, label: d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' };
  })];
}

function buildPairPerf(trades) {
  const m = {};
  trades.forEach((t) => {
    const p = t.pair || t.symbol || 'Other';
    if (!m[p]) m[p] = { pnl: 0, trades: 0, wins: 0 };
    m[p].pnl += Number(t.pnl) || 0;
    m[p].trades += 1;
    if ((Number(t.pnl) || 0) > 0) m[p].wins += 1;
  });
  return Object.entries(m).map(([pair, d]) => ({ pair, ...d, wr: d.trades ? Math.round((d.wins / d.trades) * 100) : 0 }))
    .sort((a, b) => b.pnl - a.pnl);
}

function buildSessionPerf(trades) {
  const m = {};
  trades.forEach((t) => {
    const s = t.session || 'Unknown';
    if (!m[s]) m[s] = { pnl: 0, trades: 0 };
    m[s].pnl += Number(t.pnl) || 0;
    m[s].trades += 1;
  });
  return Object.entries(m).map(([session, d]) => ({ session, ...d })).sort((a, b) => b.pnl - a.pnl);
}

function buildWeekdayPerf(trades) {
  const m = Array(7).fill(null).map((_, i) => ({ day: WEEKDAY_NAMES[i], pnl: 0, trades: 0 }));
  trades.forEach((t) => {
    const d = t.closeTime || t.openTime || t.date;
    if (!d) return;
    const wd = new Date(d).getDay();
    m[wd].pnl += Number(t.pnl) || 0;
    m[wd].trades += 1;
  });
  return m;
}

export default function PerformanceAnalytics() {
  const { connections } = useAuraConnection();
  const primaryId = connections[0]?.platformId || null;

  const [trades, setTrades] = useState([]);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(90);

  useEffect(() => {
    if (!primaryId) return;
    setLoading(true);
    Promise.all([
      Api.getAuraPlatformHistory(primaryId, period).then((r) => r.data?.trades ?? []),
      Api.getAuraPlatformAccount(primaryId).then((r) => r.data?.account ?? null),
    ])
      .then(([t, acc]) => { setTrades(Array.isArray(t) ? t : []); setAccountInfo(acc); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [primaryId, period]);

  const startBalance = accountInfo?.balance != null ? accountInfo.balance - trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0) : 10000;
  const equityCurve = useMemo(() => buildEquityCurve(trades, startBalance), [trades, startBalance]);
  const pairPerf = useMemo(() => buildPairPerf(trades), [trades]);
  const sessionPerf = useMemo(() => buildSessionPerf(trades), [trades]);
  const weekdayPerf = useMemo(() => buildWeekdayPerf(trades), [trades]);

  const totalPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = trades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const losses = trades.filter((t) => (Number(t.pnl) || 0) < 0).length;
  const wr = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const grossProfit = trades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(trades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + Number(t.pnl), 0));
  const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0';

  const eqMin = equityCurve.length ? Math.min(...equityCurve.map((p) => p.eq)) : 0;
  const eqMax = equityCurve.length ? Math.max(...equityCurve.map((p) => p.eq)) : 1;
  const pairMax = pairPerf.length ? Math.max(...pairPerf.map((p) => Math.abs(p.pnl)), 1) : 1;
  const wdExtent = weekdayPerf.length ? Math.max(...weekdayPerf.map((w) => Math.abs(w.pnl)), 1) : 1;

  if (!primaryId) {
    return (
      <div className="pa-page">
        <div className="pa-no-platform"><p>Connect a trading platform to see analytics.</p></div>
      </div>
    );
  }

  return (
    <div className="pa-page">
      <div className="pa-header">
        <div>
          <h2 className="pa-title">Performance Analytics</h2>
          <p className="pa-sub">Deep-dive analysis of your trading edge</p>
        </div>
        <div className="pa-period-btns">
          {[30, 90, 180, 365].map((d) => (
            <button key={d} type="button" className={`pa-period-btn ${period === d ? 'active' : ''}`} onClick={() => setPeriod(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="pa-loading"><div className="pa-spinner" /><span>Loading analytics…</span></div>
      ) : (
        <>
          <div className="pa-kpi-row">
            {[
              { label: 'Total P&L', value: fmtPnl(totalPnl), color: totalPnl >= 0 ? 'green' : 'red' },
              { label: 'Win Rate', value: `${wr}%`, color: wr >= 50 ? 'green' : 'red' },
              { label: 'Trades', value: trades.length },
              { label: 'W / L', value: `${wins} / ${losses}` },
              { label: 'Profit Factor', value: pf },
            ].map((k) => (
              <div key={k.label} className="pa-kpi">
                <span className="pa-kpi-label">{k.label}</span>
                <span className={`pa-kpi-value ${k.color ? `pa-kpi-value--${k.color}` : ''}`}>{k.value}</span>
              </div>
            ))}
          </div>

          {/* Equity Curve */}
          <section className="pa-section">
            <h3 className="pa-section-title">Equity Curve</h3>
            <div className="pa-equity-wrap">
              {equityCurve.length > 1 ? (
                <svg viewBox="0 0 500 120" preserveAspectRatio="none" className="pa-equity-svg">
                  <defs>
                    <linearGradient id="pa-eq-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={totalPnl >= 0 ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'} />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#pa-eq-fill)"
                    d={equityCurve.map((p, i) => {
                      const x = (i / (equityCurve.length - 1)) * 500;
                      const y = 110 - ((p.eq - eqMin) / (eqMax - eqMin || 1)) * 100;
                      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                    }).join(' ') + ` L500,110 L0,110 Z`}
                  />
                  <path
                    fill="none"
                    stroke={totalPnl >= 0 ? '#4ade80' : '#f87171'}
                    strokeWidth="2"
                    d={equityCurve.map((p, i) => {
                      const x = (i / (equityCurve.length - 1)) * 500;
                      const y = 110 - ((p.eq - eqMin) / (eqMax - eqMin || 1)) * 100;
                      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                    }).join(' ')}
                  />
                </svg>
              ) : (
                <p className="pa-chart-empty">Add trades to see equity curve</p>
              )}
              {equityCurve.length > 1 && (
                <div className="pa-equity-labels">
                  <span className="pa-equity-label-start">{fmtPnl(equityCurve[0].eq)}</span>
                  <span className={`pa-equity-label-end ${totalPnl >= 0 ? 'pa--green' : 'pa--red'}`}>{fmtPnl(equityCurve[equityCurve.length - 1].eq)}</span>
                </div>
              )}
            </div>
          </section>

          <div className="pa-two-col">
            {/* Pair Performance */}
            <section className="pa-section">
              <h3 className="pa-section-title">Pair Performance</h3>
              {pairPerf.length ? (
                <div className="pa-bar-list">
                  {pairPerf.slice(0, 8).map(({ pair, pnl, trades: tc, wr: w }) => (
                    <div key={pair} className="pa-bar-row">
                      <span className="pa-bar-label">{pair}</span>
                      <div className="pa-bar-track">
                        <div
                          className={`pa-bar-fill ${pnl >= 0 ? 'pa-bar-fill--pos' : 'pa-bar-fill--neg'}`}
                          style={{ width: `${Math.min(100, (Math.abs(pnl) / pairMax) * 100)}%` }}
                        />
                      </div>
                      <span className={`pa-bar-val ${pnl >= 0 ? 'pa--green' : 'pa--red'}`}>{fmtPnl(pnl)}</span>
                      <span className="pa-bar-meta">{tc}t · {w}%</span>
                    </div>
                  ))}
                </div>
              ) : <p className="pa-chart-empty">No pair data</p>}
            </section>

            {/* Session Performance */}
            <section className="pa-section">
              <h3 className="pa-section-title">Session Analysis</h3>
              {sessionPerf.length ? (
                <div className="pa-session-list">
                  {sessionPerf.map(({ session, pnl, trades: tc }) => (
                    <div key={session} className="pa-session-row">
                      <span className="pa-session-name">{session}</span>
                      <span className="pa-session-count">{tc} trades</span>
                      <span className={`pa-session-pnl ${pnl >= 0 ? 'pa--green' : 'pa--red'}`}>{fmtPnl(pnl)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="pa-chart-empty">No session data</p>}
            </section>
          </div>

          {/* Weekday Heatmap */}
          <section className="pa-section">
            <h3 className="pa-section-title">Day-of-Week P&amp;L</h3>
            <div className="pa-weekday-grid">
              {weekdayPerf.map(({ day, pnl, trades: tc }) => (
                <div key={day} className={`pa-wd-cell ${pnl > 0 ? 'pa-wd-cell--pos' : pnl < 0 ? 'pa-wd-cell--neg' : ''}`}>
                  <span className="pa-wd-day">{day}</span>
                  <span className={`pa-wd-pnl ${pnl >= 0 ? 'pa--green' : 'pa--red'}`}>{tc > 0 ? fmtPnl(pnl) : '—'}</span>
                  <span className="pa-wd-count">{tc > 0 ? `${tc}t` : ''}</span>
                  <div
                    className={`pa-wd-bar ${pnl >= 0 ? 'pa-wd-bar--pos' : 'pa-wd-bar--neg'}`}
                    style={{ height: `${tc > 0 ? Math.max(4, (Math.abs(pnl) / wdExtent) * 40) : 0}px` }}
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
