import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { FaPlus, FaTrashAlt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../../services/Api';
import { useTradeValidatorAccount } from '../../../context/TradeValidatorAccountContext';
import { ACCOUNT_CURRENCY_OPTIONS, formatSignedPnL } from '../../../lib/aura-analysis/formatAccountCurrency';
import '../../../styles/aura-analysis/AuraTabSection.css';
import '../../../styles/aura-analysis/Overview.css';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** TradingView-style range toggles for the Trade Validator overview calendar */
const CALENDAR_RANGE_OPTIONS = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'ALL' },
  { id: 'Custom', label: 'Custom' },
];

function startOfDayMs(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDayMs(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

/**
 * @param {string} range
 * @param {Date} viewDate — month shown in the calendar grid
 * @returns {{ start: number | null, end: number | null }}
 */
function getCalendarRangeBounds(range, viewDate) {
  const now = new Date();
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const lastDayOfMonth = new Date(y, m + 1, 0);

  switch (range) {
    case '1D': {
      const d = new Date(now);
      return { start: startOfDayMs(d), end: endOfDayMs(d) };
    }
    case '1W': {
      const end = endOfDayMs(now);
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      return { start: start.getTime(), end };
    }
    case '1M':
      return {
        start: startOfDayMs(new Date(y, m, 1)),
        end: endOfDayMs(lastDayOfMonth),
      };
    case '3M':
      return {
        start: startOfDayMs(new Date(y, m - 2, 1)),
        end: endOfDayMs(lastDayOfMonth),
      };
    case '6M':
      return {
        start: startOfDayMs(new Date(y, m - 5, 1)),
        end: endOfDayMs(lastDayOfMonth),
      };
    case '1Y':
      return {
        start: startOfDayMs(new Date(y, m - 11, 1)),
        end: endOfDayMs(lastDayOfMonth),
      };
    case 'ALL':
    case 'Custom':
      return { start: null, end: null };
    default:
      return {
        start: startOfDayMs(new Date(y, m, 1)),
        end: endOfDayMs(lastDayOfMonth),
      };
  }
}

function tradeTimestamp(t) {
  const d = t.created_at || t.createdAt || t.date;
  if (!d) return null;
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isTradeInRangeMs(ms, bounds) {
  if (bounds.start == null || bounds.end == null) return true;
  if (ms == null) return false;
  return ms >= bounds.start && ms <= bounds.end;
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
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    loading: accountsLoading,
    addAccount,
    patchAccountCurrency,
    deleteAccount,
    error: accountsError,
  } = useTradeValidatorAccount();
  const [trades, setTrades] = useState([]);
  const [pnlData, setPnlData] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  /** Calendar period filter (1D … Custom) — drives totals + day PnL in the grid */
  const [calendarTimeRange, setCalendarTimeRange] = useState('1M');
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState('USD');

  const fetchData = useCallback(() => {
    const params =
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? { validatorAccountId: selectedAccountId }
        : {};
    return Promise.all([
      Api.getAuraAnalysisTrades(params).then((r) => (r.data?.trades ?? r.data?.data ?? [])),
      Api.getAuraAnalysisPnl(params).then((r) => ({
        totalPnL: r.data?.totalPnL ?? r.data?.monthlyPnl ?? 0,
        dailyPnl: r.data?.dailyPnl,
        weeklyPnl: r.data?.weeklyPnl,
        monthlyPnl: r.data?.monthlyPnl,
      })),
    ]).then(([t, p]) => {
      setTrades(Array.isArray(t) ? t : []);
      setPnlData(typeof p === 'object' ? p : {});
    });
  }, [selectedAccountId]);

  useEffect(() => {
    if (accountsLoading) return;
    setLoading(true);
    fetchData()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountsLoading, fetchData]);

  const handleAddAccount = async () => {
    const name = newAccountName.trim();
    if (!name) {
      toast.error('Enter an account name.');
      return;
    }
    try {
      await addAccount(name, newAccountCurrency);
      setNewAccountName('');
      setNewAccountCurrency('USD');
      setShowAddModal(false);
      toast.success('Account added. Select it to use it for new trades.');
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || 'Could not add account');
    }
  };

  const kpis = useMemo(() => computeKpis(trades, pnlData), [trades, pnlData]);

  const overviewCurrency = useMemo(() => {
    const a = accounts.find((x) => Number(x.id) === Number(selectedAccountId));
    return a?.accountCurrency || 'USD';
  }, [accounts, selectedAccountId]);

  const selectedAccountLabel = useMemo(() => {
    const a = accounts.find((x) => Number(x.id) === Number(selectedAccountId));
    if (!a) return '';
    return (a.name || `Account ${a.id}`).trim();
  }, [accounts, selectedAccountId]);

  const canRemoveAccount = accounts.length >= 2 && selectedAccountId != null;

  const handleSelectedAccountCurrencyChange = async (e) => {
    if (!selectedAccountId) return;
    const ccy = e.target.value;
    try {
      await patchAccountCurrency(selectedAccountId, ccy);
      toast.success(`Account currency updated to ${ccy}.`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not update account currency');
    }
  };

  const handleConfirmRemoveAccount = async () => {
    if (!selectedAccountId || !canRemoveAccount) return;
    setRemoveSubmitting(true);
    try {
      await deleteAccount(selectedAccountId);
      setShowRemoveModal(false);
      toast.success('Account removed.');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not remove account');
    } finally {
      setRemoveSubmitting(false);
    }
  };

  const yearMonth = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

  const calendarRangeBounds = useMemo(
    () => getCalendarRangeBounds(calendarTimeRange, viewDate),
    [calendarTimeRange, viewDate]
  );

  const monthTrades = useMemo(() => {
    return trades.filter((t) => {
      const d = t.created_at || t.createdAt || t.date;
      if (!d) return false;
      const s = new Date(d).toISOString().slice(0, 7);
      if (s !== yearMonth) return false;
      return isTradeInRangeMs(tradeTimestamp(t), calendarRangeBounds);
    });
  }, [trades, yearMonth, calendarRangeBounds]);
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

  const isSelected = (cell) => {
    if (!selectedDate || cell.day === '') return false;
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    return key === selectedDate;
  };

  const handleDayClick = (cell) => {
    if (cell.day === '') return;
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    setSelectedDate((prev) => (prev === key ? null : key));
  };

  const selectedDayTrades = useMemo(() => {
    if (!selectedDate) return [];
    return trades.filter((t) => {
      const d = t.created_at || t.createdAt || t.date;
      if (!d) return false;
      if (new Date(d).toISOString().slice(0, 10) !== selectedDate) return false;
      return isTradeInRangeMs(tradeTimestamp(t), calendarRangeBounds);
    });
  }, [trades, selectedDate, calendarRangeBounds]);

  const calendarPeriodLabel = useMemo(() => {
    const mon = viewDate.toLocaleString('en-US', { month: 'long' }).toUpperCase();
    const yr = viewDate.getFullYear();
    switch (calendarTimeRange) {
      case '1D':
        return 'TODAY — PERIOD TOTAL';
      case '1W':
        return 'LAST 7 DAYS — PERIOD TOTAL';
      case '1M':
        return `${mon} ${yr} — MONTHLY TOTAL`;
      case '3M':
        return 'LAST 3 MONTHS — PERIOD TOTAL';
      case '6M':
        return 'LAST 6 MONTHS — PERIOD TOTAL';
      case '1Y':
        return 'LAST 12 MONTHS — PERIOD TOTAL';
      case 'ALL':
        return `${mon} ${yr} — ALL TRADES IN MONTH`;
      case 'Custom':
        return `${mon} ${yr} — PERIOD TOTAL`;
      default:
        return `${mon} ${yr} — MONTHLY TOTAL`;
    }
  }, [calendarTimeRange, viewDate]);

  if (accountsLoading || loading) {
    return (
      <div className="aura-overview-page">
        <p className="aura-overview-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className={`aura-overview-page ${fromTransition ? 'aura-overview-from-transition' : ''}`}>
      <div className="aura-overview-account-bar" role="toolbar" aria-label="Validator accounts">
        <span className="aura-overview-account-bar-label">Account</span>
        <div className="aura-overview-account-pills">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`aura-overview-account-pill ${Number(selectedAccountId) === Number(a.id) ? 'active' : ''}`}
              onClick={() => setSelectedAccountId(a.id)}
              title={a.accountCurrency ? `Denomination: ${a.accountCurrency}` : undefined}
            >
              {a.name || `Account ${a.id}`}
              {a.accountCurrency ? (
                <span className="aura-overview-account-ccy"> {a.accountCurrency}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="aura-overview-account-currency-wrap">
          <span className="aura-overview-account-currency-label">Currency</span>
          <select
            className="aura-overview-account-currency-select"
            value={overviewCurrency}
            onChange={handleSelectedAccountCurrencyChange}
            disabled={!selectedAccountId}
            aria-label="Selected account currency"
          >
            {ACCOUNT_CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="aura-overview-account-actions">
          <button
            type="button"
            className="aura-overview-account-remove"
            onClick={() => setShowRemoveModal(true)}
            disabled={!canRemoveAccount || removeSubmitting}
            title={
              canRemoveAccount
                ? 'Remove this account and its Trade Validator trades'
                : 'Add another account before you can remove one'
            }
            aria-label="Remove selected account"
          >
            <FaTrashAlt aria-hidden />
            <span>Remove</span>
          </button>
          <button
            type="button"
            className="aura-overview-account-add"
            onClick={() => setShowAddModal(true)}
            title="Add account"
          >
            <FaPlus aria-hidden />
            <span>Add</span>
          </button>
        </div>
      </div>
      {accountsError && <p className="aura-overview-account-error">{accountsError}</p>}
      {showRemoveModal && (
        <div
          className="aura-overview-modal-backdrop"
          role="presentation"
          onClick={() => !removeSubmitting && setShowRemoveModal(false)}
        >
          <div
            className="aura-overview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove account"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="aura-overview-modal-title">Remove account</h3>
            <p className="aura-overview-modal-sub">
              Remove <strong>{selectedAccountLabel || 'this account'}</strong>? All Trade Validator trades linked to it
              will be permanently deleted. This cannot be undone.
            </p>
            <div className="aura-overview-modal-actions">
              <button
                type="button"
                className="aura-overview-modal-btn"
                onClick={() => setShowRemoveModal(false)}
                disabled={removeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="aura-overview-modal-btn aura-overview-modal-btn--danger"
                onClick={handleConfirmRemoveAccount}
                disabled={removeSubmitting}
              >
                {removeSubmitting ? 'Removing…' : 'Remove account'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddModal && (
        <div className="aura-overview-modal-backdrop" role="presentation" onClick={() => setShowAddModal(false)}>
          <div className="aura-overview-modal" role="dialog" aria-modal="true" aria-label="Add account" onClick={(e) => e.stopPropagation()}>
            <h3 className="aura-overview-modal-title">Add Trade Validator Account</h3>
            <p className="aura-overview-modal-sub">Name it and choose the currency you trade this account in.</p>
            <label className="aura-overview-modal-label">
              Account name
              <input
                className="aura-overview-modal-input"
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="e.g. FTMO, Personal"
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="aura-overview-modal-label">
              Account currency
              <select
                className="aura-overview-modal-input"
                value={newAccountCurrency}
                onChange={(e) => setNewAccountCurrency(e.target.value)}
              >
                {ACCOUNT_CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="aura-overview-modal-actions">
              <button type="button" className="aura-overview-modal-btn" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="button" className="aura-overview-modal-btn aura-overview-modal-btn--primary" onClick={handleAddAccount}>
                Add account
              </button>
            </div>
          </div>
        </div>
      )}
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
            {formatSignedPnL(kpis.totalPnL, overviewCurrency)}
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

      <section className="aura-overview-monthly" aria-label="Trading calendar">
        <div
          className="aura-overview-cal-range-bar"
          role="toolbar"
          aria-label="Calendar time range"
        >
          {CALENDAR_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`aura-overview-cal-range-btn ${calendarTimeRange === opt.id ? 'aura-overview-cal-range-btn--active' : ''}`}
              onClick={() => setCalendarTimeRange(opt.id)}
              aria-pressed={calendarTimeRange === opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="aura-overview-monthly-header">
          <div className="aura-overview-monthly-title-row">
            <span className="aura-overview-monthly-label">{calendarPeriodLabel}</span>
          </div>
          <div className="aura-overview-monthly-summary">
            <span className={`aura-overview-monthly-pnl ${monthPnL >= 0 ? 'aura-overview-kpi-value--green' : 'aura-overview-kpi-value--red'}`}>
              {formatSignedPnL(monthPnL, overviewCurrency)}
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
              <button
                type="button"
                key={cell.day}
                className={`aura-overview-cal-day ${cell.pnl != null ? (cell.pnl >= 0 ? 'aura-overview-cal-day--win' : 'aura-overview-cal-day--loss') : ''} ${isCurrentMonth && cell.day === todayDate ? 'aura-overview-cal-day--today' : ''} ${isSelected(cell) ? 'aura-overview-cal-day--selected' : ''}`}
                onClick={() => handleDayClick(cell)}
                aria-label={`Day ${cell.day}${cell.pnl != null ? `, PnL ${formatSignedPnL(cell.pnl, overviewCurrency)}` : ''}`}
                aria-pressed={isSelected(cell)}
              >
                <span className="aura-overview-cal-num">{cell.day}</span>
                {cell.pnl != null && (
                  <span className={`aura-overview-cal-pnl ${cell.pnl >= 0 ? 'positive' : 'negative'}`}>
                    {formatSignedPnL(cell.pnl, overviewCurrency)}
                  </span>
                )}
              </button>
            )
          )}
        </div>
        {selectedDate && (
          <div className="aura-overview-selected-day">
            <div className="aura-overview-selected-day-header">
              <span className="aura-overview-selected-day-label">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <button type="button" className="aura-overview-selected-day-close" onClick={() => setSelectedDate(null)} aria-label="Close">×</button>
            </div>
            {selectedDayTrades.length === 0 ? (
              <p className="aura-overview-selected-day-empty">No trades on this day</p>
            ) : (
              <ul className="aura-overview-selected-day-list">
                {selectedDayTrades.map((t, idx) => (
                  <li key={t.id || idx} className="aura-overview-selected-day-item">
                    <span className="aura-overview-selected-day-pair">{t.pair || '—'}</span>
                    <span className={`aura-overview-selected-day-pnl ${(Number(t.pnl) || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {formatSignedPnL(t.pnl, overviewCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
