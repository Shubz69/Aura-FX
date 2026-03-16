import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../../services/Api';
import { useAuraConnection } from '../../../context/AuraConnectionContext';
import '../../../styles/aura-analysis/CalendarIntelligence.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtPnl(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtDate(str) {
  if (!str) return '';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function CalendarIntelligence() {
  const { connections } = useAuraConnection();
  const primaryId = connections[0]?.platformId || null;

  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (!primaryId) return;
    setLoading(true);
    Api.getAuraPlatformHistory(primaryId, 365)
      .then((r) => setTrades(Array.isArray(r.data?.trades) ? r.data.trades : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [primaryId]);

  const yearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  const monthTrades = useMemo(() =>
    trades.filter((t) => {
      const d = t.closeTime || t.openTime || t.created_at || t.date;
      return d && new Date(d).toISOString().slice(0, 7) === yearMonth;
    }),
  [trades, yearMonth]);

  const byDay = useMemo(() => {
    const m = {};
    monthTrades.forEach((t) => {
      const d = t.closeTime || t.openTime || t.created_at || t.date;
      if (!d) return;
      const key = new Date(d).toISOString().slice(0, 10);
      if (!m[key]) m[key] = { pnl: 0, trades: [] };
      m[key].pnl += Number(t.pnl) || 0;
      m[key].trades.push(t);
    });
    return m;
  }, [monthTrades]);

  const calCells = useMemo(() => {
    const y = viewDate.getFullYear();
    const mo = viewDate.getMonth();
    const first = new Date(y, mo, 1).getDay();
    const days = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push({ empty: true });
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, key, data: byDay[key] || null });
    }
    const rem = (first + days) % 7;
    if (rem) for (let i = 0; i < 7 - rem; i++) cells.push({ empty: true });
    return cells;
  }, [viewDate, byDay]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const monthPnl = monthTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const monthWins = monthTrades.filter((t) => (Number(t.pnl) || 0) > 0).length;
  const monthLosses = monthTrades.filter((t) => (Number(t.pnl) || 0) < 0).length;
  const monthRate = monthTrades.length ? Math.round((monthWins / monthTrades.length) * 100) : 0;

  const selectedData = selectedDate ? byDay[selectedDate] : null;

  if (!primaryId) {
    return (
      <div className="ci-page">
        <div className="ci-no-platform">
          <p>Connect a trading platform to see your calendar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ci-page">
      <div className="ci-header">
        <div>
          <h2 className="ci-title">Calendar Intelligence</h2>
          <p className="ci-sub">Daily P&amp;L calendar — click a day to see details</p>
        </div>
        <div className="ci-header-nav">
          <button type="button" className="ci-nav-btn" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))}>‹</button>
          <span className="ci-month-label">
            {viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button type="button" className="ci-nav-btn" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))}>›</button>
        </div>
      </div>

      <div className="ci-summary-strip">
        <div className="ci-stat">
          <span className="ci-stat-label">Month P&amp;L</span>
          <span className={`ci-stat-value ${monthPnl >= 0 ? 'ci-stat-value--green' : 'ci-stat-value--red'}`}>{fmtPnl(monthPnl)}</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-label">Trades</span>
          <span className="ci-stat-value">{monthTrades.length}</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-label">Win Rate</span>
          <span className="ci-stat-value">{monthRate}%</span>
        </div>
        <div className="ci-stat">
          <span className="ci-stat-label">W / L</span>
          <span className="ci-stat-value">{monthWins} / {monthLosses}</span>
        </div>
      </div>

      {loading ? (
        <div className="ci-loading">
          <div className="ci-loading-spinner" />
          <span>Loading calendar…</span>
        </div>
      ) : (
        <div className="ci-calendar-wrap">
          <div className="ci-cal-weekdays">
            {WEEKDAYS.map((d) => <div key={d} className="ci-cal-dow">{d}</div>)}
          </div>
          <div className="ci-cal-grid">
            {calCells.map((cell, i) =>
              cell.empty ? (
                <div key={`e-${i}`} className="ci-cal-day ci-cal-day--empty" />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  className={[
                    'ci-cal-day',
                    cell.data ? (cell.data.pnl >= 0 ? 'ci-cal-day--win' : 'ci-cal-day--loss') : '',
                    cell.key === todayKey ? 'ci-cal-day--today' : '',
                    selectedDate === cell.key ? 'ci-cal-day--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedDate(selectedDate === cell.key ? null : cell.key)}
                >
                  <span className="ci-cal-num">{cell.day}</span>
                  {cell.data && (
                    <>
                      <span className={`ci-cal-pnl ${cell.data.pnl >= 0 ? 'positive' : 'negative'}`}>{fmtPnl(cell.data.pnl)}</span>
                      <span className="ci-cal-trades">{cell.data.trades.length}t</span>
                    </>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {selectedData && selectedDate && (
        <div className="ci-detail">
          <div className="ci-detail-header">
            <span className="ci-detail-date">{fmtDate(selectedDate)}</span>
            <span className={`ci-detail-pnl ${selectedData.pnl >= 0 ? 'positive' : 'negative'}`}>{fmtPnl(selectedData.pnl)}</span>
          </div>
          <div className="ci-detail-trades">
            {selectedData.trades.map((t, i) => (
              <div key={i} className="ci-detail-row">
                <span className="ci-detail-pair">{t.pair || t.symbol || '—'}</span>
                <span className="ci-detail-dir">{t.direction || t.type || '—'}</span>
                <span className={`ci-detail-result ${(Number(t.pnl) || 0) >= 0 ? 'win' : 'loss'}`}>
                  {(Number(t.pnl) || 0) >= 0 ? 'WIN' : 'LOSS'}
                </span>
                <span className="ci-detail-note">{t.notes || t.comment || ''}</span>
                <span className={`ci-detail-pnl-cell ${(Number(t.pnl) || 0) >= 0 ? 'positive' : 'negative'}`}>{fmtPnl(t.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && monthTrades.length === 0 && (
        <div className="ci-empty">No trades found for this month.</div>
      )}
    </div>
  );
}
