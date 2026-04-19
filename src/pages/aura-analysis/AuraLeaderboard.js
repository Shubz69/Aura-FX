import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Api from '../../services/Api';
import '../../styles/aura-analysis/AuraLeaderboard.css';

const SORT_OPTIONS = [
  { value: 'pnl', label: 'Total PnL' },
  { value: 'trades', label: 'Trades' },
  { value: 'winRate', label: 'Win rate' },
  { value: 'avgR', label: 'Avg R' },
  { value: 'profitFactor', label: 'PF' },
  { value: 'consistency', label: 'Consistency' },
];

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0.00';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `$${abs}` : `-$${abs}`;
}

/** Custom listbox — avoids OS-native select popup (often white on Windows). */
function LeaderboardSortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const current = SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0];

  return (
    <div className="aura-lb-sort-dd" ref={wrapRef}>
      <button
        type="button"
        className="aura-lb-sort-dd-trigger"
        id="aura-lb-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="aura-lb-sort-listbox"
        aria-label={`Sort leaderboard by, currently ${current.label}. Open to change.`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current.label}</span>
        <span className="aura-lb-sort-dd-chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul
          id="aura-lb-sort-listbox"
          className="aura-lb-sort-dd-list"
          role="listbox"
          aria-labelledby="aura-lb-sort-trigger"
        >
          {SORT_OPTIONS.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`aura-lb-sort-dd-option${opt.value === value ? ' aura-lb-sort-dd-option--active' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AuraLeaderboard() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('pnl');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    setLoading(true);
    setError(null);
    Api.getAuraAnalysisLeaderboard(sortBy, order)
      .then((res) => {
        const list = res.data?.leaderboard ?? [];
        setLeaderboard(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load leaderboard');
        setLeaderboard([]);
      })
      .finally(() => setLoading(false));
  }, [sortBy, order]);

  const toggleOrder = () => {
    setOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  return (
    <div className="aura-leaderboard">
      <div className="aura-leaderboard-header">
        <h1 className="aura-leaderboard-title">Leaderboard</h1>
        <div className="aura-leaderboard-controls">
          <div className="aura-leaderboard-sort-label">
            <span id="aura-lb-sort-label">Sort by</span>
            <LeaderboardSortMenu value={sortBy} onChange={setSortBy} />
          </div>
          <button
            type="button"
            className="aura-leaderboard-order-btn"
            onClick={toggleOrder}
            aria-label="Toggle sort order"
          >
            {order === 'desc' ? '↓ Descending' : '↑ Ascending'}
          </button>
        </div>
      </div>

      {error && <p className="aura-leaderboard-error">{error}</p>}
      {loading ? (
        <p className="aura-leaderboard-loading">Loading leaderboard…</p>
      ) : (
        <div className="aura-leaderboard-table-wrap">
          <table className="aura-leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Trader</th>
                <th>Trades</th>
                <th>Win rate</th>
                <th>Avg R</th>
                <th>PnL</th>
                <th>PF</th>
                <th>Consistency</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={8} className="aura-leaderboard-empty">
                    No traders yet. Use The Operator or Trader Desk to log trades and appear here.
                  </td>
                </tr>
              ) : (
                leaderboard.map((row) => {
                  const isYou = currentUserId != null && row.userId === currentUserId;
                  return (
                    <tr
                      key={row.userId}
                      className={isYou ? 'aura-leaderboard-row-you' : ''}
                    >
                      <td>{row.rank}</td>
                      <td className="aura-leaderboard-trader">
                        {isYou ? 'You (local)' : row.trader}
                      </td>
                      <td>{row.trades}</td>
                      <td>{row.winRate.toFixed(2)}%</td>
                      <td>{row.avgR.toFixed(2)}</td>
                      <td className={row.pnl >= 0 ? 'aura-leaderboard-pnl-pos' : 'aura-leaderboard-pnl-neg'}>
                        {formatPnL(row.pnl)}
                      </td>
                      <td>{row.profitFactor.toFixed(2)}</td>
                      <td>{row.consistency}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
