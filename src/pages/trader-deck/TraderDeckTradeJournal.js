import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import { useTradeValidatorAccount } from '../../context/TradeValidatorAccountContext';
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

/** PnL string for Edit Outcome when result is win/loss/breakeven/open (from calculator potential profit/loss). */
function getVerificationMeta(t) {
  const s = String(t.outcomeVerificationStatus || t.outcome_verification_status || 'none').toLowerCase();
  if (s === 'verified') return { label: 'Verified', cls: 'td-journal-verify--ok' };
  if (s === 'self_reported') return { label: 'Self', cls: 'td-journal-verify--self' };
  if (s === 'failed') return { label: 'Unverified', cls: 'td-journal-verify--fail' };
  return { label: '—', cls: '' };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function getPnlForResult(trade, result) {
  if (!trade) return '';
  const profit = trade.potentialProfit ?? trade.potential_profit;
  const loss = trade.potentialLoss ?? trade.potential_loss;
  const p = Number(profit);
  const l = Number(loss);
  switch (String(result).toLowerCase()) {
    case 'win':
      return Number.isFinite(p) && p >= 0 ? String(p) : '';
    case 'loss':
      return Number.isFinite(l) && l >= 0 ? String(-l) : '';
    case 'breakeven':
      return '0';
    default:
      return '';
  }
}

export default function TraderDeckTradeJournal() {
  const { accounts, selectedAccountId, loading: accountsLoading } = useTradeValidatorAccount();
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
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [verifyTrade, setVerifyTrade] = useState(null);
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const loadTrades = useCallback(async () => {
    const params =
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? { validatorAccountId: selectedAccountId }
        : {};
    const r = await Api.getAuraAnalysisTrades(params);
    const list = r.data?.trades ?? r.data?.data ?? [];
    setTrades(Array.isArray(list) ? list : []);
  }, [selectedAccountId]);

  useEffect(() => {
    if (accountsLoading) return;
    setLoading(true);
    loadTrades()
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [accountsLoading, loadTrades]);

  const closeVerify = () => {
    setVerifyTrade(null);
    setVerifyFile(null);
    setVerifyBusy(false);
  };

  const submitVerify = async () => {
    if (!verifyTrade?.id || !verifyFile) {
      toast.error('Choose a screenshot first.');
      return;
    }
    setVerifyBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(verifyFile);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mimeType = verifyFile.type || 'image/png';
      const res = await Api.verifyTradeOutcome(verifyTrade.id, base64, mimeType);
      if (res.data?.applied) toast.success(res.data?.message || 'Outcome saved from screenshot.');
      else toast.warning(res.data?.message || 'Could not confirm from this image — try a clearer screenshot.');
      await loadTrades();
      closeVerify();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Verification failed');
    } finally {
      setVerifyBusy(false);
    }
  };

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
    const result = (t.result || 'open').toLowerCase();
    setEditTrade(t);
    setEditResult(result);
    setEditPnl(t.pnl != null ? String(t.pnl) : getPnlForResult(t, result));
    setSaveError(null);
  };

  const closeEdit = () => {
    setEditTrade(null);
    setEditResult('open');
    setEditPnl('');
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editTrade?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await Api.updateAuraAnalysisTrade(editTrade.id, {
        result: editResult,
        pnl: editPnl === '' ? null : Number(editPnl),
        outcomeSource: 'manual',
      });
      const updated = res.data?.trade;
      setTrades((prev) =>
        prev.map((x) => {
          if (x.id !== editTrade.id) return x;
          if (updated && typeof updated === 'object') return { ...x, ...updated };
          return {
            ...x,
            result: editResult,
            pnl: editPnl === '' ? null : Number(editPnl),
            outcomeVerificationStatus: 'self_reported',
            outcomeVerification: null,
          };
        })
      );
      closeEdit();
    } catch (e) {
      const msg = e.response?.data?.message || e.message || 'Failed to save';
      setSaveError(msg);
      console.error('Trade outcome save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!t?.id) return;
    const ok = window.confirm(`Delete this ${t.pair || 'trade'} trade? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(t.id);
    try {
      await Api.deleteAuraAnalysisTrade(t.id);
      await loadTrades();
      if (editTrade?.id === t.id) closeEdit();
    } catch (e) {
      window.alert(e.response?.data?.message || e.message || 'Failed to delete trade');
    } finally {
      setDeletingId(null);
    }
  };

  const assetClasses = useMemo(() => {
    const set = new Set(trades.map((t) => t.assetClass || t.asset_class || '').filter(Boolean));
    return Array.from(set).sort();
  }, [trades]);

  const selectedAccountName = useMemo(() => {
    if (selectedAccountId == null) return null;
    const a = accounts.find((x) => Number(x.id) === Number(selectedAccountId));
    return a?.name || `Account ${selectedAccountId}`;
  }, [accounts, selectedAccountId]);

  return (
    <div className="td-journal">
      <h2 className="td-journal-title">Trade Journal</h2>
      {selectedAccountName && (
        <p className="td-journal-account-line">Account: {selectedAccountName}</p>
      )}

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
        {accountsLoading || loading ? (
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
                <th>Proof</th>
                <th>R</th>
                <th>Session</th>
                <th>Grade</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="td-journal-empty">No trades match your filters.</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const res = (t.result || '').toLowerCase();
                  const isWin = res === 'win' || (Number(t.pnl) > 0 && res !== 'loss');
                  const isLoss = res === 'loss' || (Number(t.pnl) < 0 && res !== 'win');
                  const resultLabel = res === 'breakeven' ? 'BREAKEVEN' : isWin ? 'WIN' : isLoss ? 'LOSS' : '—';
                  const pnlNum = t.pnl != null ? Number(t.pnl) : null;
                  const ver = getVerificationMeta(t);
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
                      <td>
                        <span className={['td-journal-verify-badge', ver.cls].filter(Boolean).join(' ')}>{ver.label}</span>
                      </td>
                      <td>{t.rMultiple != null ? formatNum(t.rMultiple, 2) : t.rr != null ? formatNum(t.rr, 2) : '—'}</td>
                      <td>{t.session || '—'}</td>
                      <td>{getDisplayGrade(t)}</td>
                      <td className="td-journal-actions">
                        <button type="button" className="td-journal-action-link" onClick={() => setVerifyTrade(t)}>
                          Verify screenshot
                        </button>
                        <span className="td-journal-action-sep" aria-hidden>·</span>
                        <button type="button" className="td-journal-action-link" onClick={() => openEdit(t)}>
                          Edit Outcome
                        </button>
                        <span className="td-journal-action-sep" aria-hidden>·</span>
                        <button
                          type="button"
                          className="td-journal-action-link td-journal-action-delete"
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                        >
                          {deletingId === t.id ? 'Deleting…' : 'Delete'}
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
            <p className="td-journal-modal-hint">
              Manual saves are marked as self-reported. Upload a broker screenshot to verify win/loss and PnL.
            </p>
            <div className="td-journal-modal-form">
              <label>
                Result
                <select
                  value={editResult}
                  onChange={(e) => {
                    const newResult = e.target.value;
                    setEditResult(newResult);
                    setEditPnl(getPnlForResult(editTrade, newResult));
                  }}
                >
                  <option value="open">Open</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="breakeven">Breakeven</option>
                </select>
              </label>
              <label>
                PnL ($) — auto-filled for Win/Loss, editable
                <input
                  type="number"
                  step="0.01"
                  value={editPnl}
                  onChange={(e) => setEditPnl(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            {saveError && <p className="td-journal-modal-error" role="alert">{saveError}</p>}
            <div className="td-journal-modal-actions">
              <button type="button" className="td-journal-modal-btn primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="td-journal-modal-btn" onClick={closeEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {verifyTrade && (
        <div className="td-journal-modal-overlay" onClick={closeVerify} role="presentation">
          <div className="td-journal-modal td-journal-modal--verify" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-journal-modal-title">Verify with screenshot</h3>
            <p className="td-journal-modal-pair">
              {verifyTrade.pair} · {verifyTrade.direction} — upload a clear image of closed P/L from your platform.
            </p>
            <input
              type="file"
              accept="image/*"
              className="td-journal-verify-file"
              onChange={(e) => setVerifyFile(e.target.files?.[0] || null)}
            />
            {verifyFile && (
              <p className="td-journal-verify-filename">{verifyFile.name}</p>
            )}
            <div className="td-journal-modal-actions">
              <button type="button" className="td-journal-modal-btn primary" onClick={submitVerify} disabled={verifyBusy || !verifyFile}>
                {verifyBusy ? 'Checking…' : 'Run verification'}
              </button>
              <button type="button" className="td-journal-modal-btn" onClick={closeVerify} disabled={verifyBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
