import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Api from '../../../services/Api';
import '../../../styles/aura-analysis/AuraTabSection.css';
import '../../../styles/aura-analysis/Overview.css';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0';
  const v = Number(n);
  if (v >= 0) return `+$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return {
    totalTrades,
    winRate,
    averageR: avgR,
    totalPnL,
    profitFactor,
    averageRR: avgRR,
    bestPair,
    worstPair,
    wins,
    losses,
  };
}

export default function Overview() {
  const location = useLocation();
  const fromTransition = location.state?.fromTransition === true;
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());

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

  const yearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const monthTrades = useMemo(
    () =>
      trades.filter((t) => {
        const d = t.created_at || t.createdAt || t.date;
        if (!d) return false;
        const s = new Date(d).toISOString().slice(0, 7);
        return s === yearMonth;
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
    for (let i = 0; i < startPad; i++) out.push({ day: '', pnl: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ day: d, pnl: byDay[key] ?? null });
    }
    const remainder = (startPad + daysInMonth) % 7;
    if (remainder) for (let i = 0; i < 7 - remainder; i++) out.push({ day: '', pnl: null });
    return out;
  }, [viewDate, monthTrades]);

  const monthLabel = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  const today = new Date();
  const isCurrentMonth = viewDate.getMonth() === today.getMonth() && viewDate.getFullYear() === today.getFullYear();
  const todayDate = today.getDate();

  if (loading) {
    return (
      <div className="aura-overview-page">
        <p className="aura-overview-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`aura-overview-page ${fromTransition ? 'aura-overview-from-transition' : ''}`}>
      <h2 className="aura-overview-glance-title">Your trading performance at a glance</h2>
      <div className="aura-overview-kpi-grid">
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Total Trades</span>
          <span className="aura-overview-kpi-value">{kpis.totalTrades}</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Win Rate</span>
          <span className="aura-overview-kpi-value aura-overview-kpi-value--green">{kpis.winRate.toFixed(2)}%</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Average R</span>
          <span className="aura-overview-kpi-value">{kpis.averageR.toFixed(2)}</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Total PnL</span>
          <span className={`aura-overview-kpi-value ${kpis.totalPnL >= 0 ? 'aura-overview-kpi-value--green' : 'aura-overview-kpi-value--red'}`}>
            {formatPnL(kpis.totalPnL)}
          </span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Profit Factor</span>
          <span className="aura-overview-kpi-value">{kpis.profitFactor > 0 ? kpis.profitFactor.toFixed(2) : '—'}</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Average RR</span>
          <span className="aura-overview-kpi-value">{kpis.averageRR > 0 ? kpis.averageRR.toFixed(2) : '—'}</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Best Pair</span>
          <span className="aura-overview-kpi-value">{kpis.bestPair}</span>
        </div>
        <div className="aura-overview-kpi-card">
          <span className="aura-overview-kpi-label">Worst Pair</span>
          <span className="aura-overview-kpi-value">{kpis.worstPair}</span>
        </div>
      </div>

      <section className="aura-overview-monthly">
        <div className="aura-overview-monthly-header">
          <div className="aura-overview-monthly-title-row">
            <span className="aura-overview-monthly-label">
              {viewDate.toLocaleString('en-US', { month: 'long' }).toUpperCase()} {viewDate.getFullYear()} — MONTHLY TOTAL
            </span>
          </div>
          <div className="aura-overview-monthly-summary">
            <span className={`aura-overview-monthly-pnl ${monthPnL >= 0 ? 'aura-overview-kpi-value--green' : 'aura-overview-kpi-value--red'}`}>
              {formatPnL(monthPnL)}
            </span>
            <span className="aura-overview-monthly-meta">
              {monthTrades.length} trades {monthWins > 0 || monthLosses > 0 ? ` · ${monthWins}W ${monthLosses}L` : ''}
            </span>
          </div>
          <div className="aura-overview-monthly-nav">
            <button type="button" className="aura-overview-month-nav-btn" onClick={prevMonth} aria-label="Previous month">
              ‹
            </button>
            <span className="aura-overview-month-nav-label">{monthLabel}</span>
            <button type="button" className="aura-overview-month-nav-btn" onClick={nextMonth} aria-label="Next month">
              ›
            </button>
          </div>
        </div>
        <div className="aura-overview-calendar-grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="aura-overview-cal-dow">
              {d}
            </div>
          ))}
          {calendarDays.map((cell, i) =>
            cell.day === '' ? (
              <div key={`e-${i}`} className="aura-overview-cal-day aura-overview-cal-day--empty" />
            ) : (
              <div
                key={cell.day}
                className={`aura-overview-cal-day ${cell.pnl != null ? (cell.pnl >= 0 ? 'aura-overview-cal-day--win' : 'aura-overview-cal-day--loss') : ''} ${isCurrentMonth && cell.day === todayDate ? 'aura-overview-cal-day--today' : ''}`}
              >
                <span className="aura-overview-cal-num">{cell.day}</span>
                {cell.pnl != null && (
                  <span className={`aura-overview-cal-pnl ${cell.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatPnL(cell.pnl)}
                  </span>
                )}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
