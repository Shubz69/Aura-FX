import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Api from '../../services/Api';
import '../../styles/trader-deck/TraderDeckOverview.css';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0.00';
  const v = Number(n);
  if (v >= 0) return `+$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function computeKpis(trades = [], pnlData = {}) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => (t.result || '').toLowerCase() === 'win' || (Number(t.pnl) || 0) > 0).length;
  const losses = trades.filter((t) => (t.result || '').toLowerCase() === 'loss' || (Number(t.pnl) || 0) < 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnL = pnlData.totalPnL != null ? pnlData.totalPnL : trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const avgR = trades.length ? trades.reduce((s, t) => s + (Number(t.rMultiple) || Number(t.rr) || 0), 0) / trades.length : 0;
  const grossProfit = trades.filter((t) => (Number(t.pnl) || 0) > 0).reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(trades.filter((t) => (Number(t.pnl) || 0) < 0).reduce((s, t) => s + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgRR = trades.length ? trades.reduce((s, t) => s + (Number(t.rr) || 0), 0) / trades.length : 0;
  const byPair = {};
  trades.forEach((t) => {
    const pair = t.pair || '—';
    if (!byPair[pair]) byPair[pair] = { pnl: 0, count: 0 };
    byPair[pair].pnl += Number(t.pnl) || 0;
    byPair[pair].count += 1;
  });
  const pairs = Object.entries(byPair).map(([pair, d]) => ({ pair, pnl: d.pnl }));
  pairs.sort((a, b) => b.pnl - a.pnl);
  const bestPair = pairs[0]?.pair ?? '—';
  const worstPair = pairs[pairs.length - 1]?.pair ?? '—';
  return { totalTrades, winRate, averageR: avgR, totalPnL, profitFactor, averageRR: avgRR, bestPair, worstPair, wins, losses };
}

function buildEquityCurve(trades, startBalance = 10000) {
  const sorted = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt || a.date) - new Date(b.created_at || b.createdAt || b.date));
  const out = [{ date: sorted[0] ? (sorted[0].created_at || sorted[0].createdAt || sorted[0].date) : new Date().toISOString().slice(0, 10), equity: startBalance }];
  let equity = startBalance;
  sorted.forEach((t) => {
    equity += Number(t.pnl) || 0;
    out.push({ date: t.created_at || t.createdAt || t.date, equity });
  });
  return out;
}

function buildPairPerformance(trades) {
  const byPair = {};
  trades.forEach((t) => {
    const pair = t.pair || '—';
    if (!byPair[pair]) byPair[pair] = 0;
    byPair[pair] += Number(t.pnl) || 0;
  });
  return Object.entries(byPair).map(([pair, pnl]) => ({ pair, pnl })).sort((a, b) => b.pnl - a.pnl);
}

function buildSessionPerformance(trades) {
  const bySession = {};
  trades.forEach((t) => {
    const session = t.session || 'Unknown';
    if (!bySession[session]) bySession[session] = 0;
    bySession[session] += Number(t.pnl) || 0;
  });
  return Object.entries(bySession).map(([session, pnl]) => ({ session, pnl })).sort((a, b) => b.pnl - a.pnl);
}

export default function TraderDeckOverview() {
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    Promise.all([
      Api.getAuraAnalysisTrades().then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl().then((r) => ({
        totalPnL: r.data?.totalPnL ?? r.data?.monthlyPnl ?? 0,
        dailyPnl: r.data?.dailyPnl,
        weeklyPnl: r.data?.weeklyPnl,
        monthlyPnl: r.data?.monthlyPnl,
      })),
    ])
      .then(([t, p]) => {
        setTrades(Array.isArray(t) ? t : []);
        setPnlData(typeof p === 'object' ? p : {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = useMemo(() => computeKpis(trades, pnlData), [trades, pnlData]);
  const equityCurve = useMemo(() => buildEquityCurve(trades), [trades]);
  const pairPerformance = useMemo(() => buildPairPerformance(trades), [trades]);
  const sessionPerformance = useMemo(() => buildSessionPerformance(trades), [trades]);
  const recentTrades = useMemo(() => [...trades].sort((a, b) => new Date(b.created_at || b.createdAt || b.date) - new Date(a.created_at || a.createdAt || a.date)).slice(0, 10), [trades]);

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
  const monthWins = monthTrades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const monthLosses = monthTrades.filter((t) => (Number(t.pnl) || 0) < 0).length;
  const monthPnL = monthTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

  const calendarDays = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const byDay = {};
    monthTrades.forEach((t) => {
      const d = t.created_at || t.createdAt || t.date;
      if (!d) return;
      const key = new Date(d).toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = 0;
      byDay[key] += Number(t.pnl) || 0;
    });
    const out = [];
    for (let i = 0; i < startPad; i++) out.push({ day: '', pnl: null, dateKey: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ day: d, pnl: byDay[key] ?? null, dateKey: key });
    }
    const remainder = (startPad + daysInMonth) % 7;
    if (remainder) for (let i = 0; i < 7 - remainder; i++) out.push({ day: '', pnl: null, dateKey: null });
    return out;
  }, [viewDate, monthTrades]);

  const monthLabel = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const isCurrentMonth = viewDate.getMonth() === today.getMonth() && viewDate.getFullYear() === today.getFullYear();
  const todayDate = today.getDate();

  const equityMin = equityCurve.length ? Math.min(...equityCurve.map((e) => e.equity)) : 0;
  const equityMax = equityCurve.length ? Math.max(...equityCurve.map((e) => e.equity)) : 1;
  const pairMax = pairPerformance.length ? Math.max(...pairPerformance.map((p) => p.pnl), 1) : 1;
  const sessionExtent = sessionPerformance.length
    ? Math.max(...sessionPerformance.map((s) => Math.abs(s.pnl)), 1)
    : 1;

  if (loading) {
    return (
      <div className="td-overview-page">
        <p className="td-overview-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="td-overview-page">
      <h2 className="td-overview-glance-title">Your trading performance at a glance</h2>
      <div className="td-overview-kpi-grid">
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Total Trades</span>
          <span className="td-overview-kpi-value">{kpis.totalTrades}</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Win Rate</span>
          <span className="td-overview-kpi-value td-overview-kpi-value--green">{kpis.winRate.toFixed(2)}%</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Average R</span>
          <span className="td-overview-kpi-value">{kpis.averageR.toFixed(2)}</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Total PnL</span>
          <span className={`td-overview-kpi-value ${kpis.totalPnL >= 0 ? 'td-overview-kpi-value--green' : 'td-overview-kpi-value--red'}`}>
            {formatPnL(kpis.totalPnL)}
          </span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Profit Factor</span>
          <span className="td-overview-kpi-value">{kpis.profitFactor > 0 ? kpis.profitFactor.toFixed(2) : '—'}</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Average RR</span>
          <span className="td-overview-kpi-value">{kpis.averageRR > 0 ? kpis.averageRR.toFixed(2) : '—'}</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Best Pair</span>
          <span className="td-overview-kpi-value">{kpis.bestPair}</span>
        </div>
        <div className="td-overview-kpi-card">
          <span className="td-overview-kpi-label">Worst Pair</span>
          <span className="td-overview-kpi-value">{kpis.worstPair}</span>
        </div>
      </div>

      <section className="td-overview-monthly">
        <div className="td-overview-monthly-header">
          <div className="td-overview-monthly-left">
            <span className="td-overview-monthly-label">
              {viewDate.toLocaleString('en-US', { month: 'long' }).toUpperCase()} {viewDate.getFullYear()} — MONTHLY TOTAL
            </span>
            <div className="td-overview-monthly-summary">
              <span className={`td-overview-monthly-pnl ${monthPnL >= 0 ? 'td-overview-kpi-value--green' : 'td-overview-kpi-value--red'}`}>
                {formatPnL(monthPnL)}
              </span>
              <span className="td-overview-monthly-meta">
                {monthTrades.length} trades {monthWins > 0 || monthLosses > 0 ? ` · ${monthWins}W ${monthLosses}L` : ''}
              </span>
            </div>
          </div>
          <div className="td-overview-monthly-nav">
            <button type="button" className="td-overview-month-nav-btn" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))} aria-label="Previous month">
              ‹
            </button>
            <span className="td-overview-month-nav-label">{monthLabel}</span>
            <button type="button" className="td-overview-month-nav-btn" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))} aria-label="Next month">
              ›
            </button>
          </div>
        </div>
        <div className="td-overview-calendar-grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="td-overview-cal-dow">{d}</div>
          ))}
          {calendarDays.map((cell, i) =>
            cell.day === '' ? (
              <div key={`e-${i}`} className="td-overview-cal-day td-overview-cal-day--empty" />
            ) : (
              <button
                type="button"
                key={cell.day}
                className={`td-overview-cal-day ${cell.pnl != null ? (cell.pnl >= 0 ? 'td-overview-cal-day--win' : 'td-overview-cal-day--loss') : ''} ${isCurrentMonth && cell.day === todayDate ? 'td-overview-cal-day--today' : ''} ${selectedDate === cell.dateKey ? 'td-overview-cal-day--selected' : ''}`}
                onClick={() => setSelectedDate(cell.dateKey)}
              >
                <span className="td-overview-cal-num">{cell.day}</span>
                {cell.pnl != null && (
                  <span className={`td-overview-cal-pnl ${cell.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatPnL(cell.pnl)}
                  </span>
                )}
              </button>
            )
          )}
        </div>
        {selectedDate ? (
          <p className="td-overview-calendar-hint">Daily results for selected day — click a day with trades to see details.</p>
        ) : (
          <p className="td-overview-calendar-hint">Click a day with trades to see results. Select a day in the calendar above to view that day&apos;s performance.</p>
        )}
      </section>

      <div className="td-overview-charts-grid">
        <section className="td-overview-chart-card">
          <h3 className="td-overview-chart-title">Equity Curve</h3>
          <div className="td-overview-equity-chart">
            {equityCurve.length > 1 ? (
              <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="td-overview-equity-svg">
                <defs>
                  <linearGradient id="td-equity-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(99,179,237,0.4)" />
                    <stop offset="100%" stopColor="rgba(99,179,237,0)" />
                  </linearGradient>
                </defs>
                <path
                  fill="url(#td-equity-fill)"
                  d={equityCurve
                    .map((p, i) => {
                      const x = (i / (equityCurve.length - 1)) * 400;
                      const y = 110 - ((p.equity - equityMin) / (equityMax - equityMin || 1)) * 100;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .join(' ')}
                />
                <path
                  fill="none"
                  stroke="rgba(99,179,237,0.9)"
                  strokeWidth="2"
                  d={equityCurve
                    .map((p, i) => {
                      const x = (i / (equityCurve.length - 1)) * 400;
                      const y = 110 - ((p.equity - equityMin) / (equityMax - equityMin || 1)) * 100;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    })
                    .join(' ')}
                />
              </svg>
            ) : (
              <p className="td-overview-chart-empty">Add trades to see equity curve</p>
            )}
          </div>
        </section>

        <section className="td-overview-chart-card">
          <h3 className="td-overview-chart-title">Performance by Pair</h3>
          <div className="td-overview-pair-chart">
            {pairPerformance.length ? (
              pairPerformance.slice(0, 5).map(({ pair, pnl }) => (
                <div key={pair} className="td-overview-pair-row">
                  <span className="td-overview-pair-label">{pair}</span>
                  <div className="td-overview-pair-bar-wrap">
                    <div
                      className={`td-overview-pair-bar ${pnl >= 0 ? 'positive' : 'negative'}`}
                      style={{ width: `${Math.min(100, (Math.abs(pnl) / pairMax) * 100)}%` }}
                    />
                  </div>
                  <span className={`td-overview-pair-value ${pnl >= 0 ? 'positive' : 'negative'}`}>{formatPnL(pnl)}</span>
                </div>
              ))
            ) : (
              <p className="td-overview-chart-empty">No pair data yet</p>
            )}
          </div>
        </section>

        <section className="td-overview-chart-card">
          <h3 className="td-overview-chart-title">Performance by Session</h3>
          <div className="td-overview-session-chart">
            {sessionPerformance.length ? (
              sessionPerformance.map(({ session, pnl }) => (
                <div key={session} className="td-overview-session-row">
                  <span className="td-overview-session-label">{session}</span>
                  <div className="td-overview-session-bar-wrap">
                    <div
                      className={`td-overview-session-bar ${pnl >= 0 ? 'positive' : 'negative'}`}
                      style={{ height: `${Math.min(100, (Math.abs(pnl) / sessionExtent) * 80)}%` }}
                    />
                  </div>
                  <span className={`td-overview-session-value ${pnl >= 0 ? 'positive' : 'negative'}`}>{formatPnL(pnl)}</span>
                </div>
              ))
            ) : (
              <p className="td-overview-chart-empty">No session data yet</p>
            )}
          </div>
        </section>

        <section className="td-overview-chart-card td-overview-recent-card">
          <div className="td-overview-recent-header">
            <h3 className="td-overview-chart-title">Recent Trades</h3>
            <Link to="/trader-deck/trade-validator/overview" className="td-overview-view-all">View all</Link>
          </div>
          <div className="td-overview-recent-table-wrap">
            <table className="td-overview-recent-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pair</th>
                  <th>Dir</th>
                  <th>Result</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.length ? (
                  recentTrades.map((t, i) => (
                    <tr key={t.id || i}>
                      <td>{formatDate(t.created_at || t.createdAt || t.date)}</td>
                      <td>{t.pair || '—'}</td>
                      <td>{(t.direction || '').toLowerCase()}</td>
                      <td>
                        <span className={`td-overview-result ${(t.result || '').toLowerCase() === 'win' || (Number(t.pnl) || 0) > 0 ? 'win' : 'loss'}`}>
                          {(t.result || '').toUpperCase() || ((Number(t.pnl) || 0) >= 0 ? 'WIN' : 'LOSS')}
                        </span>
                      </td>
                      <td className={(Number(t.pnl) || 0) >= 0 ? 'td-overview-pnl-positive' : 'td-overview-pnl-negative'}>
                        {formatPnL(t.pnl)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No trades yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
