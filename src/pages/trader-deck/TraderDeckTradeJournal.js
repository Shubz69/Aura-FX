import React, { useState, useEffect, useMemo } from 'react';
import Api from '../../services/Api';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import '../../styles/trader-deck/TraderDeckTradeJournal.css';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const mon = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(2);
  return `${mon} ${day}.${year}`;
}

function formatPnL(n) {
  if (n == null || Number.isNaN(n)) return '$0.00';
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `$${abs}` : `-$${abs}`;
}

function formatNum(v, decimals = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Grade for display: use stored tradeGrade, or derive from checklist score (0–200) / checklist % (0–100). */
function getDisplayGrade(t) {
  if (t.tradeGrade && String(t.tradeGrade).trim()) return t.tradeGrade;
  const score = t.checklistScore != null ? Number(t.checklistScore) : null;
  if (score != null && Number.isFinite(score)) return getScoreLabel(score);
  const pct = t.checklistPercent != null ? Number(t.checklistPercent) : null;
  if (pct != null && Number.isFinite(pct)) return getScoreLabel(Math.round(pct * 2));
  return '—';
}

export default function TraderDeckTradeJournal() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPair, setFilterPair] = useState('all');
  const [filterResult, setFilterResult] = useState('all');
  const [filterAsset, setFilterAsset] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  const [editTrade, setEditTrade] = useState(null);
  const [editResult, setEditResult] = useState('open');
  const [editPnl, setEditPnl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Api.getAuraAnalysisTrades()
      .then((r) => {
        const list = r.data?.trades ?? r.data?.data ?? [];
        setTrades(Array.isArray(list) ? list : []);
      })
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, []);

  const pairs = useMemo(() => {
    const set = new Set(trades.map((t) => t.pair || '').filter(Boolean));
    return Array.from(set).sort();
  }, [trades]);
  const sessions = useMemo(() => {
    const set = new Set(trades.map((t) => t.session || '').filter(Boolean));
    return Array.from(set).sort();
  }, [trades]);
  const grades = useMemo(() => {
    const set = new Set(trades.map((t) => getDisplayGrade(t)).filter((g) => g && g !== '—'));
    return Array.from(set).sort();
  }, [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      const pair = (t.pair || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      const searchLower = search.trim().toLowerCase();
      if (searchLower && !pair.includes(searchLower) && !notes.includes(searchLower)) return false;
      if (filterPair !== 'all' && (t.pair || '') !== filterPair) return false;
      const res = (t.result || '').toLowerCase();
      if (filterResult === 'win' && res !== 'win') return false;
      if (filterResult === 'loss' && res !== 'loss') return false;
      if (filterResult === 'breakeven' && res !== 'breakeven') return false;
      if (filterAsset !== 'all' && (t.assetClass || t.asset_class || '') !== filterAsset) return false;
      if (filterGrade !== 'all' && getDisplayGrade(t) !== filterGrade) return false;
      if (filterSession !== 'all' && (t.session || '') !== filterSession) return false;
      return true;
    });
  }, [trades, search, filterPair, filterResult, filterAsset, filterGrade, filterSession]);

  const openEdit = (t) => {
    setEditTrade(t);
    setEditResult((t.result || 'open').toLowerCase());
    setEditPnl(t.pnl != null ? String(t.pnl) : '');
  };

  const closeEdit = () => {
    setEditTrade(null);
    setEditResult('open');
    setEditPnl('');
  };

  const saveEdit = async () => {
    if (!editTrade?.id) return;
    setSaving(true);
    try {
      await Api.updateAuraAnalysisTrade(editTrade.id, {
        result: editResult,
        pnl: editPnl === '' ? null : Number(editPnl),
      });
      setTrades((prev) =>
        prev.map((x) =>
          x.id === editTrade.id
            ? { ...x, result: editResult, pnl: editPnl === '' ? null : Number(editPnl) }
            : x
        )
      );
      closeEdit();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const assetClasses = useMemo(() => {
    const set = new Set(trades.map((t) => t.assetClass || t.asset_class || '').filter(Boolean));
    return Array.from(set).sort();
  }, [trades]);

  return (
    <div className="td-journal">
      <h2 className="td-journal-title">Trade Journal</h2>

      <div className="td-journal-toolbar">
        <input
          type="text"
          className="td-journal-search"
          placeholder="Search pair or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="td-journal-filters">
          <select
            className="td-journal-select"
            value={filterPair}
            onChange={(e) => setFilterPair(e.target.value)}
            aria-label="Filter by pair"
          >
            <option value="all">All pairs</option>
            {pairs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="td-journal-select"
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
            aria-label="Filter by result"
          >
            <option value="all">All</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
          <select
            className="td-journal-select"
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            aria-label="Filter by asset class"
          >
            <option value="all">All</option>
            {assetClasses.map((a) => (
              <option key={a} value={a}>{a || '—'}</option>
            ))}
          </select>
          <select
            className="td-journal-select"
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            aria-label="Filter by grade"
          >
            <option value="all">All</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g || '—'}</option>
            ))}
          </select>
          <select
            className="td-journal-select"
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
            aria-label="Filter by session"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s} value={s}>{s || '—'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="td-journal-table-wrap">
        {loading ? (
          <p className="td-journal-loading">Loading trades…</p>
        ) : (
          <table className="td-journal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pair</th>
                <th>Asset class</th>
                <th>Dir</th>
                <th>Entry</th>
                <th>SL</th>
                <th>TP</th>
                <th>Risk %</th>
                <th>Result</th>
                <th>PnL</th>
                <th>R</th>
                <th>Session</th>
                <th>Grade</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="td-journal-empty">No trades match your filters.</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const res = (t.result || '').toLowerCase();
                  const isWin = res === 'win' || (Number(t.pnl) > 0 && res !== 'loss');
                  const isLoss = res === 'loss' || (Number(t.pnl) < 0 && res !== 'win');
                  const resultLabel = res === 'breakeven' ? 'BREAKEVEN' : isWin ? 'WIN' : isLoss ? 'LOSS' : '—';
                  const pnlNum = t.pnl != null ? Number(t.pnl) : null;
                  return (
                    <tr key={t.id}>
                      <td>{formatDate(t.createdAt || t.created_at)}</td>
                      <td>{t.pair || '—'}</td>
                      <td>{(t.assetClass || t.asset_class || '—').toLowerCase()}</td>
                      <td>{(t.direction || '—').toLowerCase()}</td>
                      <td>{formatNum(t.entryPrice ?? t.entry_price, 2)}</td>
                      <td>{formatNum(t.stopLoss ?? t.stop_loss, 2)}</td>
                      <td>{formatNum(t.takeProfit ?? t.take_profit, 2)}</td>
                      <td>{t.riskPercent != null ? `${Number(t.riskPercent)}%` : '—'}</td>
                      <td>
                        <span className={`td-journal-badge ${isWin ? 'win' : isLoss ? 'loss' : ''}`}>
                          {resultLabel}
                        </span>
                      </td>
                      <td className={pnlNum != null && pnlNum < 0 ? 'td-journal-pnl-neg' : pnlNum != null && pnlNum > 0 ? 'td-journal-pnl-pos' : ''}>
                        {formatPnL(t.pnl)}
                      </td>
                      <td>{t.rMultiple != null ? formatNum(t.rMultiple, 2) : t.rr != null ? formatNum(t.rr, 2) : '—'}</td>
                      <td>{t.session || '—'}</td>
                      <td>{getDisplayGrade(t)}</td>
                      <td>
                        <button type="button" className="td-journal-action-link" onClick={() => openEdit(t)}>
                          Edit Outcome
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {editTrade && (
        <div className="td-journal-modal-overlay" onClick={closeEdit} role="presentation">
          <div className="td-journal-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-journal-modal-title">Edit Outcome</h3>
            <p className="td-journal-modal-pair">{editTrade.pair} · {editTrade.direction}</p>
            <div className="td-journal-modal-form">
              <label>
                Result
                <select value={editResult} onChange={(e) => setEditResult(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="breakeven">Breakeven</option>
                </select>
              </label>
              <label>
                PnL ($)
                <input
                  type="number"
                  step="0.01"
                  value={editPnl}
                  onChange={(e) => setEditPnl(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            <div className="td-journal-modal-actions">
              <button type="button" className="td-journal-modal-btn primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="td-journal-modal-btn" onClick={closeEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
