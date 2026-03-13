/**
 * Aura Analysis Dashboard — Overview tab: full grid layout (Equity, Calendar, Key Stats,
 * Equity Curve, Daily, Sessions, Trade Log, Win/Loss Ratio, Trade Distribution, Streaks).
 * Uses styles from Overview.css (aura-overview-grid, aura-card, etc.).
 */
import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../../services/Api';
import { computeStreaks } from '../../../lib/aura-analysis/trader-cv/streakEngine';
import '../../../styles/aura-analysis/Overview.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0';
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
    if (!bySession[session]) bySession[session] = { pnl: 0, count: 0, maxR: 0 };
    const pnl = Number(t.pnl) || 0;
    bySession[session].pnl += pnl;
    bySession[session].count += 1;
    const r = Number(t.rMultiple) ?? Number(t.rr) ?? 0;
    if (Math.abs(r) > bySession[session].maxR) bySession[session].maxR = r;
  });
  return Object.entries(bySession).map(([session, d]) => ({ session, pnl: d.pnl, count: d.count, maxR: d.maxR })).sort((a, b) => b.pnl - a.pnl);
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

function buildDistributionBuckets(trades, numBuckets = 10) {
  if (!trades.length) return [];
  const sorted = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt));
  const step = Math.max(1, Math.ceil(sorted.length / numBuckets));
  const out = [];
  for (let i = 0; i < sorted.length; i += step) {
    const chunk = sorted.slice(i, i + step);
    const total = chunk.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    out.push(total);
  }
  return out;
}

export default function OverviewDashboard() {
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());

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
      .finally(() => setLoading(false));
  }, []);

  const totalPnL = pnlData.monthlyPnl != null ? pnlData.monthlyPnl : trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = trades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const losses = trades.filter((t) => (Number(t.pnl) || 0) < 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const grossProfit = trades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(trades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '99' : '0');
  const avgR = trades.length ? trades.reduce((s, t) => s + (Number(t.rMultiple) ?? Number(t.rr) ?? 0), 0) / trades.length : 0;
  const expectancy = trades.length ? totalPnL / trades.length : 0;
  const startBalance = 10000;
  const equity = startBalance + totalPnL;

  const equityCurve = useMemo(() => buildEquityCurve(trades, startBalance), [trades]);
  const sessionPerformance = useMemo(() => buildSessionPerformance(trades), [trades]);
  const dailyPnL = useMemo(() => buildDailyPnL(trades), [trades]);
  const distributionBuckets = useMemo(() => buildDistributionBuckets(trades), [trades]);
  const streaks = useMemo(() => computeStreaks({}, trades), [trades]);

  const equityMin = equityCurve.length ? Math.min(...equityCurve.map((p) => p.equity)) : 0;
  const equityMax = equityCurve.length ? Math.max(...equityCurve.map((p) => p.equity)) : 1;
  const distMax = distributionBuckets.length ? Math.max(...distributionBuckets.map(Math.abs), 1) : 1;

  const bestDay = useMemo(() => {
    if (!dailyPnL.length) return null;
    return dailyPnL.reduce((a, b) => (a.pnl >= b.pnl ? a : b), { date: '', pnl: -Infinity });
  }, [dailyPnL]);
  const worstDay = useMemo(() => {
    if (!dailyPnL.length) return null;
    return dailyPnL.reduce((a, b) => (a.pnl <= b.pnl ? a : b), { date: '', pnl: Infinity });
  }, [dailyPnL]);

  const yearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const monthTrades = useMemo(
    () =>
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

  const recentTrades = useMemo(() => [...trades].sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)).slice(0, 12), [trades]);

  if (loading) {
    return (
      <div className="aura-overview-page">
        <p className="aura-overview-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="aura-overview-page">
      <div className="aura-overview-grid">
        {/* Left column */}
        <div className="aura-overview-col">
          <div className="aura-card">
            <h3 className="aura-card-title">Overview</h3>
            <div className="aura-summary-list">
              <div className="aura-summary-row">
                <span className="aura-summary-label">Equity</span>
                <span className="aura-summary-value positive">{formatPnL(equity)}</span>
                <span className="aura-summary-meta">4.64% today · 9.29%</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Net P/L</span>
                <span className={`aura-summary-value ${totalPnL >= 0 ? 'positive' : ''}`}>{formatPnL(totalPnL)}</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Win Rate</span>
                <span className="aura-summary-value">{winRate}%</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Profit Factor</span>
                <span className="aura-summary-value">{profitFactor}</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Expectancy</span>
                <span className={`aura-summary-value ${expectancy >= 0 ? 'positive' : ''}`}>{formatPnL(expectancy)} / Trade</span>
              </div>
              <div className="aura-summary-row">
                <span className="aura-summary-label">Risk Score</span>
                <span className="aura-summary-value purple">Low Risk 1.5% *</span>
              </div>
            </div>
          </div>

          <div className="aura-card">
            <div className="aura-card-head">
              <h3 className="aura-card-title">Calendar</h3>
              <div className="aura-card-controls">
                <button type="button" className="aura-btn-ghost" onClick={prevMonth} aria-label="Previous month">‹</button>
                <span className="aura-date-range">{monthLabel}</span>
                <button type="button" className="aura-btn-ghost" onClick={nextMonth} aria-label="Next month">›</button>
              </div>
            </div>
            <div className="aura-calendar-grid">
              {WEEKDAYS.map((d) => (
                <div key={d} className="aura-calendar-dow">{d}</div>
              ))}
              {calendarDays.map((cell, i) =>
                cell.day === '' ? (
                  <div key={`e-${i}`} className="aura-calendar-day" />
                ) : (
                  <div
                    key={cell.day}
                    className={`aura-calendar-day ${cell.pnl != null ? (cell.pnl >= 0 ? 'green' : 'purple') : ''}`}
                  >
                    {cell.day}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="aura-card">
            <h3 className="aura-card-title">Key Stats</h3>
            <div className="aura-key-stats-bar" aria-hidden />
            <div className="aura-key-stats-list">
              <div className="aura-key-stat"><span>Trade Range</span><span>{trades.length}</span></div>
              <div className="aura-key-stat"><span>Win rate</span><span>{winRate}%</span></div>
              <div className="aura-key-stat"><span>Avg RR</span><span>{avgR > 0 ? avgR.toFixed(1) + 'R' : '—'}</span></div>
            </div>
          </div>
        </div>

        {/* Middle column */}
        <div className="aura-overview-col">
          <div className="aura-card">
            <div className="aura-card-head">
              <h3 className="aura-card-title">Equity Curve</h3>
              <span className="aura-date-range">Apr 1 – 2024</span>
              <select className="aura-select" defaultValue="day"><option value="day">Day</option><option value="week">Week</option></select>
            </div>
            <div className="aura-chart-placeholder aura-equity-chart">
              {equityCurve.length > 1 && (
                <>
                  <span className="aura-chart-y">${(equityMax / 1000).toFixed(0)}k</span>
                  <span className="aura-chart-y">${(equityMin / 1000).toFixed(0)}k</span>
                  <div
                    className="aura-chart-line"
                    style={{
                      bottom: `${22 + (1 - (equityCurve[equityCurve.length - 1]?.equity - equityMin) / (equityMax - equityMin || 1)) * 70}%`,
                    }}
                  />
                  <span className="aura-chart-x">
                    {new Date(equityCurve[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} –{' '}
                    {new Date(equityCurve[equityCurve.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="aura-card">
            <h3 className="aura-card-title">Daily</h3>
            <div className="aura-chart-placeholder aura-daily-chart">
              {dailyPnL.length > 0 && <div className="aura-chart-line" style={{ bottom: '30%' }} />}
            </div>
            <div className="aura-daily-buttons">
              <span className="aura-pct positive">61%</span>
              <span className="aura-pct" style={{ color: 'var(--ov-red)' }}>75%</span>
            </div>
          </div>

          <div className="aura-card">
            <h3 className="aura-card-title">Sessions</h3>
            <div className="aura-sessions-list">
              {sessionPerformance.length ? (
                sessionPerformance.map(({ session, pnl, maxR }) => (
                  <div key={session} className="aura-session">
                    <span className="aura-session-name">{session}</span>
                    <span className={`aura-session-value ${pnl >= 0 ? 'positive' : ''}`}>{formatPnL(pnl)}</span>
                    <span className="aura-session-meta">Max RR {maxR ? maxR.toFixed(1) + 'R' : '—'} · Avg Risk 1.2%</span>
                  </div>
                ))
              ) : (
                <p className="aura-session-meta">No session data yet</p>
              )}
            </div>
            {trades.length > 0 && <p className="aura-sessions-meta">{trades.length} Trades</p>}
          </div>

          <div className="aura-card aura-trade-log-card">
            <h3 className="aura-card-title">Trade Log</h3>
            <div className="aura-trade-log-wrap">
              <table className="aura-trade-log">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pair</th>
                    <th>Setup</th>
                    <th>Result</th>
                    <th>P/L</th>
                    <th>R</th>
                    <th>Session</th>
                    <th>Risk</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((t, idx) => (
                    <tr key={t.id || idx}>
                      <td>{new Date(t.created_at || t.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</td>
                      <td>{t.pair || '—'}</td>
                      <td>—</td>
                      <td>{(t.result || '').toLowerCase() || '—'}</td>
                      <td className={(Number(t.pnl) || 0) >= 0 ? 'positive' : 'negative'}>{formatPnL(t.pnl)}</td>
                      <td>{t.rMultiple != null ? Number(t.rMultiple).toFixed(1) + 'R' : t.rr != null ? Number(t.rr).toFixed(1) + 'R' : '—'}</td>
                      <td>{t.session || '—'}</td>
                      <td>{t.riskPercent != null ? t.riskPercent + '%' : '—'}</td>
                      <td>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="aura-overview-col">
          <div className="aura-card">
            <h3 className="aura-card-title">Win/Loss Ratio</h3>
            <div className="aura-donut-wrap">
              <div
                className="aura-donut"
                style={{
                  background: `conic-gradient(rgba(139,92,246,0.9) 0deg ${(winRate / 100) * 360}deg, rgba(248,113,113,0.85) ${(winRate / 100) * 360}deg 360deg)`,
                }}
              />
              <span className="aura-donut-label">{winRate}%</span>
            </div>
            <p className="aura-donut-legend"><span className="win">Wins</span> · <span className="loss">Losses</span></p>
            <div className="aura-best-worst">
              <p><span className="label">Best Day</span><span className="positive">{bestDay ? formatPnL(bestDay.pnl) + ' on ' + new Date(bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span></p>
              <p><span className="label">Worst Day</span><span className={worstDay && worstDay.pnl < 0 ? 'negative' : 'positive'}>{worstDay ? formatPnL(worstDay.pnl) + ' on ' + new Date(worstDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span></p>
            </div>
            <div className="aura-risk-donut">
              <div className="aura-donut-wrap aura-donut-sm">
                <div className="aura-donut" style={{ background: 'conic-gradient(rgba(139,92,246,0.9) 0deg 302deg, rgba(255,255,255,0.1) 302deg 360deg)' }} />
                <span className="aura-donut-label">84%</span>
              </div>
              <p className="aura-risk-legend">Risk: Compliance</p>
            </div>
          </div>

          <div className="aura-card">
            <h3 className="aura-card-title">Trade Distribution</h3>
            <div className="aura-bar-chart">
              {distributionBuckets.length ? (
                distributionBuckets.map((val, i) => (
                  <div
                    key={i}
                    className="aura-bar"
                    style={{ height: `${(Math.abs(val) / distMax) * 100}%` }}
                    title={formatPnL(val)}
                  />
                ))
              ) : (
                Array.from({ length: 10 }, (_, i) => <div key={i} className="aura-bar" style={{ height: '4px' }} />)
              )}
            </div>
            <div className="aura-bar-labels">
              {distributionBuckets.slice(0, 11).map((_, i) => <span key={i}>{i}</span>)}
            </div>
          </div>

          <div className="aura-card">
            <h3 className="aura-card-title">Streaks</h3>
            <div className="aura-streaks-list">
              <p><span className="aura-streak-label">Journal streak</span><span className="positive">{streaks.journalStreak}</span></p>
              <p><span className="aura-streak-label">Rule adherence</span><span className="positive">{streaks.ruleAdherenceStreak}</span></p>
              <p><span className="aura-streak-label">Disciplined days</span><span className="positive">{streaks.disciplinedDaysStreak}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
