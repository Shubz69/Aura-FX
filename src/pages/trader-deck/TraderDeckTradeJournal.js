import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import { useAuth } from '../../context/AuthContext';
import { useOperatorAccount } from '../../context/OperatorAccountContext';
import { mergeTradeMetadataRowMulti } from '../../lib/aura-analysis/tradeMetadataStorage';
import { compressImageToJpegDataUrl, COMPRESS_PRESETS } from '../../utils/compressImageToJpegDataUrl';
import { formatSignedPnL } from '../../lib/aura-analysis/formatAccountCurrency';
import { getScoreLabel } from '../../lib/aura-analysis/validator/scoreCalculator';
import { stripReplayHandoffParams, TR_HANDOFF } from '../../lib/trader-replay/replayToolHandoff';
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

const JOURNAL_COL_META = [
  { id: 'date', label: 'Date', defaultOn: true },
  { id: 'pair', label: 'Pair', defaultOn: true },
  { id: 'asset', label: 'Asset', defaultOn: true },
  { id: 'dir', label: 'Dir', defaultOn: true },
  { id: 'entry', label: 'Entry', defaultOn: true },
  { id: 'sl', label: 'SL', defaultOn: true },
  { id: 'tp', label: 'TP', defaultOn: true },
  { id: 'risk', label: 'Risk %', defaultOn: true },
  { id: 'result', label: 'Result', defaultOn: true },
  { id: 'pnl', label: 'PnL', defaultOn: true },
  { id: 'roiRisk', label: 'Return on risk %', defaultOn: false },
  { id: 'proof', label: 'Proof', defaultOn: true },
  { id: 'r', label: 'R', defaultOn: true },
  { id: 'session', label: 'Session', defaultOn: true },
  { id: 'grade', label: 'Grade', defaultOn: true },
  { id: 'duration', label: 'Hold time', defaultOn: false },
  { id: 'notes', label: 'Notes', defaultOn: false },
  { id: 'setup', label: 'Setup', defaultOn: true },
  { id: 'checklist', label: 'Checklist %', defaultOn: false },
  { id: 'rating', label: 'Rating', defaultOn: false },
  { id: 'action', label: 'Action', defaultOn: true, required: true },
];

const COL_VIS_KEY = 'td-journal-column-visibility-v2';

function readColumnVisibility() {
  const base = {};
  JOURNAL_COL_META.forEach((c) => { base[c.id] = c.defaultOn; });
  if (typeof window === 'undefined' || !window.localStorage) return base;
  try {
    const raw = window.localStorage.getItem(COL_VIS_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return base;
    return { ...base, ...o };
  } catch {
    return base;
  }
}

function returnOnRiskPct(t) {
  const pnl = Number(t?.pnl);
  const risk = Math.abs(Number(t?.potentialLoss ?? t?.potential_loss ?? 0));
  if (!Number.isFinite(pnl) || risk < 1e-9) return null;
  return (pnl / risk) * 100;
}

function holdDurationLabel(t) {
  const o = t.openTime || t.open_time || t.createdAt || t.created_at;
  const c = t.closeTime || t.close_time;
  if (!o || !c) return null;
  const ms = new Date(c).getTime() - new Date(o).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
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
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const replayDeckConsumedRef = useRef(false);
  const [replayContext, setReplayContext] = useState(null);
  const { accounts, selectedAccountId, loading: accountsLoading } = useOperatorAccount();
  const journalCurrency = useMemo(() => {
    const a = accounts.find((x) => Number(x.id) === Number(selectedAccountId));
    return a?.accountCurrency || 'USD';
  }, [accounts, selectedAccountId]);
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
  const [verifyImage, setVerifyImage] = useState(null);
  const [verifyPrepBusy, setVerifyPrepBusy] = useState(false);
  const [verifyDragOver, setVerifyDragOver] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const verifyFileRef = useRef(null);
  const verifyCameraRef = useRef(null);
  const [colVis, setColVis] = useState(() => readColumnVisibility());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const colPopRef = useRef(null);
  const colVisSaveTimerRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    Api.getUserSettings()
      .then((res) => {
        const remote = res.data?.settings?.trading_ui_prefs?.tradeJournalColumns;
        if (cancelled || !remote || typeof remote !== 'object') return;
        const base = {};
        JOURNAL_COL_META.forEach((c) => {
          base[c.id] = c.defaultOn;
        });
        const merged = { ...base, ...remote };
        setColVis(merged);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(COL_VIS_KEY, JSON.stringify(merged));
          }
        } catch {
          /* noop */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(
    () => () => {
      if (colVisSaveTimerRef.current) {
        clearTimeout(colVisSaveTimerRef.current);
      }
    },
    []
  );

  const persistColVis = useCallback((next) => {
    setColVis(next);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(COL_VIS_KEY, JSON.stringify(next));
      }
    } catch {
      /* noop */
    }
    if (colVisSaveTimerRef.current) clearTimeout(colVisSaveTimerRef.current);
    colVisSaveTimerRef.current = setTimeout(() => {
      colVisSaveTimerRef.current = null;
      Api.putUserSettings({ trading_ui_prefs: { tradeJournalColumns: next } }).catch(() => {});
    }, 600);
  }, []);

  const toggleColumn = useCallback(
    (id, required) => {
      if (required) return;
      persistColVis({ ...colVis, [id]: !colVis[id] });
    },
    [colVis, persistColVis]
  );

  useEffect(() => {
    if (!columnsOpen) return undefined;
    const onDoc = (e) => {
      if (colPopRef.current && !colPopRef.current.contains(e.target)) setColumnsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [columnsOpen]);

  const loadTrades = useCallback(async () => {
    const params =
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? { validatorAccountId: selectedAccountId }
        : {};
    const r = await Api.getAuraAnalysisTrades(params);
    const list = r.data?.trades ?? r.data?.data ?? [];
    const arr = Array.isArray(list) ? list : [];
    const platformIds = [
      selectedAccountId != null && Number.isFinite(Number(selectedAccountId))
        ? `validator-${selectedAccountId}`
        : null,
      'mt5',
      'mt4',
      'default',
    ].filter(Boolean);
    const merged = user?.id
      ? arr.map((t) => mergeTradeMetadataRowMulti(user.id, platformIds, t))
      : arr;
    setTrades(merged);
  }, [selectedAccountId, user?.id]);

  useEffect(() => {
    if (accountsLoading) return;
    setLoading(true);
    loadTrades()
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [accountsLoading, loadTrades]);

  useEffect(() => {
    if (replayDeckConsumedRef.current) return;
    if (!searchParams.get(TR_HANDOFF.origin) && !searchParams.get('replaySessionId')) return;
    replayDeckConsumedRef.current = true;
    setReplayContext({
      symbol: searchParams.get('symbol') || '',
      lesson: (searchParams.get('mainLesson') || '').slice(0, 200),
      returnTo: searchParams.get(TR_HANDOFF.returnToReplay) || '',
    });
    setSearchParams(stripReplayHandoffParams(searchParams), { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!replayContext?.symbol || !trades.length) return;
    const pairSet = new Set(trades.map((t) => t.pair || '').filter(Boolean));
    if (pairSet.has(replayContext.symbol)) setFilterPair(replayContext.symbol);
  }, [trades, replayContext]);

  const closeVerify = () => {
    setVerifyTrade(null);
    setVerifyImage(null);
    setVerifyPrepBusy(false);
    setVerifyDragOver(false);
    setVerifyBusy(false);
  };

  const applyVerifyFile = useCallback(async (file) => {
    if (!file || !verifyTrade) return;
    setVerifyPrepBusy(true);
    try {
      const dataUrl = await compressImageToJpegDataUrl(file, COMPRESS_PRESETS.tradeVerify);
      setVerifyImage({ dataUrl, label: file.name || 'Screenshot' });
    } catch (err) {
      toast.error(err?.message || 'Could not use this image.');
    } finally {
      setVerifyPrepBusy(false);
    }
  }, [verifyTrade]);

  useEffect(() => {
    if (!verifyTrade) return undefined;
    const onPaste = (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const files = cd.files;
      if (files && files[0] && files[0].type.startsWith('image/')) {
        e.preventDefault();
        void applyVerifyFile(files[0]);
        return;
      }
      const items = cd.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) {
            e.preventDefault();
            void applyVerifyFile(f);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [verifyTrade, applyVerifyFile]);

  const submitVerify = async () => {
    if (!verifyTrade?.id || !verifyImage?.dataUrl) {
      toast.error('Add a screenshot first (camera, file, paste, or drop).');
      return;
    }
    setVerifyBusy(true);
    try {
      const dataUrl = verifyImage.dataUrl;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mimeType = 'image/jpeg';
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

  const visibleColMeta = useMemo(
    () => JOURNAL_COL_META.filter((c) => colVis[c.id] !== false),
    [colVis]
  );

  const exportCsv = useCallback(() => {
    const dataCols = visibleColMeta.filter((c) => c.id !== 'action');
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lineFor = (t) => {
      const res = (t.result || '').toLowerCase();
      const isWin = res === 'win' || (Number(t.pnl) > 0 && res !== 'loss');
      const isLoss = res === 'loss' || (Number(t.pnl) < 0 && res !== 'win');
      const resultLabel = res === 'breakeven' ? 'BREAKEVEN' : isWin ? 'WIN' : isLoss ? 'LOSS' : '—';
      const roi = returnOnRiskPct(t);
      const ver = getVerificationMeta(t);
      const map = {
        date: formatDate(t.createdAt || t.created_at),
        pair: t.pair || '',
        asset: (t.assetClass || t.asset_class || '').toLowerCase(),
        dir: (t.direction || '').toLowerCase(),
        entry: formatNum(t.entryPrice ?? t.entry_price, 2),
        sl: formatNum(t.stopLoss ?? t.stop_loss, 2),
        tp: formatNum(t.takeProfit ?? t.take_profit, 2),
        risk: t.riskPercent != null ? `${Number(t.riskPercent)}%` : '',
        result: resultLabel,
        pnl: formatSignedPnL(t.pnl, journalCurrency),
        roiRisk: roi != null && Number.isFinite(roi) ? `${roi.toFixed(1)}%` : '',
        proof: ver.label,
        r: t.rMultiple != null ? formatNum(t.rMultiple, 2) : t.rr != null ? formatNum(t.rr, 2) : '',
        session: t.session || '',
        grade: getDisplayGrade(t),
        duration: holdDurationLabel(t) || '',
        notes: [t.notes, t.userNote].filter(Boolean).join(' ').slice(0, 500),
        setup: t.userSetupKey || '',
        checklist:
          t.checklistPercent != null && Number.isFinite(Number(t.checklistPercent))
            ? `${formatNum(Number(t.checklistPercent), 1)}%`
            : '',
        rating: t.userRating != null ? String(t.userRating) : '',
      };
      return dataCols.map((c) => esc(map[c.id] ?? '')).join(',');
    };
    const header = dataCols.map((c) => esc(c.label)).join(',');
    const blob = new Blob([[header, ...filtered.map(lineFor)].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-trade-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filtered, visibleColMeta, journalCurrency]);

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
      {replayContext ? (
        <div className="td-journal-replay-handoff" role="status">
          <span className="td-journal-replay-chip">From Trader Replay</span>
          {replayContext.symbol ? (
            <span className="td-journal-replay-meta">Symbol filter: {replayContext.symbol}</span>
          ) : null}
          {replayContext.lesson ? (
            <p className="td-journal-replay-lesson">{replayContext.lesson}</p>
          ) : null}
          <div className="td-journal-replay-actions">
            {replayContext.returnTo ? (
              <Link to={replayContext.returnTo} className="td-journal-replay-link">
                Back to replay
              </Link>
            ) : null}
            <Link
              to="/journal"
              className="td-journal-replay-link"
            >
              Daily Journal (reflection)
            </Link>
          </div>
        </div>
      ) : null}

      <div className="td-journal-toolbar" role="search" aria-label="Journal filters">
        <input
          type="text"
          className="td-journal-search"
          placeholder="Search pair or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="td-journal-filters" aria-label="Filter trades">
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
        <div className="td-journal-toolbar-actions">
          <div className="td-journal-columns-wrap" ref={colPopRef}>
            <button
              type="button"
              className="td-journal-tool-btn"
              onClick={() => setColumnsOpen((o) => !o)}
              aria-expanded={columnsOpen}
            >
              Columns
            </button>
            {columnsOpen ? (
              <div className="td-journal-columns-pop" role="dialog" aria-label="Choose columns">
                <div className="td-journal-columns-pop-title">Visible columns</div>
                <ul className="td-journal-columns-list">
                  {JOURNAL_COL_META.map((c) => (
                    <li key={c.id}>
                      <label className={c.required ? 'td-journal-col-lock' : ''}>
                        <input
                          type="checkbox"
                          checked={colVis[c.id] !== false}
                          disabled={!!c.required}
                          onChange={() => toggleColumn(c.id, c.required)}
                        />
                        {c.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <button type="button" className="td-journal-tool-btn" onClick={exportCsv} disabled={!filtered.length}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="td-journal-table-wrap">
        {accountsLoading || loading ? (
          <p className="td-journal-loading">Loading trades…</p>
        ) : (
          <table className="td-journal-table">
            <thead>
              <tr>
                {visibleColMeta.map((c) => (
                  <th key={c.id} scope="col">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(visibleColMeta.length, 1)} className="td-journal-empty">No trades match your filters.</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const res = (t.result || '').toLowerCase();
                  const isWin = res === 'win' || (Number(t.pnl) > 0 && res !== 'loss');
                  const isLoss = res === 'loss' || (Number(t.pnl) < 0 && res !== 'win');
                  const resultLabel = res === 'breakeven' ? 'BREAKEVEN' : isWin ? 'WIN' : isLoss ? 'LOSS' : '—';
                  const pnlNum = t.pnl != null ? Number(t.pnl) : null;
                  const ver = getVerificationMeta(t);
                  const roi = returnOnRiskPct(t);
                  const noteText = [t.notes, t.userNote].filter(Boolean).join(' — ').trim();
                  const cells = {
                    date: formatDate(t.createdAt || t.created_at),
                    pair: t.pair || '—',
                    asset: (t.assetClass || t.asset_class || '—').toLowerCase(),
                    dir: (t.direction || '—').toLowerCase(),
                    entry: formatNum(t.entryPrice ?? t.entry_price, 2),
                    sl: formatNum(t.stopLoss ?? t.stop_loss, 2),
                    tp: formatNum(t.takeProfit ?? t.take_profit, 2),
                    risk: t.riskPercent != null ? `${Number(t.riskPercent)}%` : '—',
                    result: (
                      <span className={`td-journal-badge ${isWin ? 'win' : isLoss ? 'loss' : ''}`}>
                        {resultLabel}
                      </span>
                    ),
                    pnl: (
                      <span
                        className={[
                          pnlNum != null && pnlNum < 0 ? 'td-journal-pnl-neg' : '',
                          pnlNum != null && pnlNum > 0 ? 'td-journal-pnl-pos' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {formatSignedPnL(t.pnl, journalCurrency)}
                      </span>
                    ),
                    roiRisk: roi != null && Number.isFinite(roi) ? `${roi.toFixed(1)}%` : '—',
                    proof: <span className={['td-journal-verify-badge', ver.cls].filter(Boolean).join(' ')}>{ver.label}</span>,
                    r: t.rMultiple != null ? formatNum(t.rMultiple, 2) : t.rr != null ? formatNum(t.rr, 2) : '—',
                    session: t.session || '—',
                    grade: getDisplayGrade(t),
                    duration: holdDurationLabel(t) || '—',
                    notes: noteText ? <span title={noteText}>{noteText.length > 56 ? `${noteText.slice(0, 54)}…` : noteText}</span> : '—',
                    setup: t.userSetupKey ? <span title={t.userSetupKey}>{t.userSetupKey}</span> : '—',
                    checklist:
                      t.checklistPercent != null && Number.isFinite(Number(t.checklistPercent))
                        ? `${formatNum(Number(t.checklistPercent), 1)}%`
                        : '—',
                    rating: t.userRating != null ? String(t.userRating) : '—',
                    action: (
                      <div className="td-journal-actions">
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
                      </div>
                    ),
                  };
                  return (
                    <tr key={t.id}>
                      {visibleColMeta.map((c) => (
                        <td key={c.id}>{cells[c.id]}</td>
                      ))}
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
                PnL ({journalCurrency}) — auto-filled for Win/Loss, editable
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
            <p className="td-journal-verify-hint">
              Use camera or gallery, choose a file, drag and drop onto the area below, or paste an image (Ctrl+V / ⌘V).
            </p>
            <div
              className={['td-journal-verify-drop', verifyDragOver ? 'td-journal-verify-drop--active' : ''].filter(Boolean).join(' ')}
              onDragEnter={(e) => {
                e.preventDefault();
                setVerifyDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setVerifyDragOver(true);
              }}
              onDragLeave={() => setVerifyDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setVerifyDragOver(false);
                const f = e.dataTransfer?.files?.[0];
                if (f) void applyVerifyFile(f);
              }}
            >
              {verifyImage?.dataUrl ? (
                <>
                  <img src={verifyImage.dataUrl} alt="Screenshot preview" className="td-journal-verify-preview" />
                  <p className="td-journal-verify-filename">{verifyImage.label}</p>
                  <div className="td-journal-verify-tools">
                    <button
                      type="button"
                      className="td-journal-modal-btn"
                      disabled={verifyPrepBusy || verifyBusy}
                      onClick={() => verifyFileRef.current?.click()}
                    >
                      {verifyPrepBusy ? 'Working…' : 'Replace…'}
                    </button>
                    <button
                      type="button"
                      className="td-journal-modal-btn"
                      disabled={verifyPrepBusy || verifyBusy}
                      onClick={() => verifyCameraRef.current?.click()}
                    >
                      Camera / photo
                    </button>
                    <button
                      type="button"
                      className="td-journal-modal-btn"
                      disabled={verifyPrepBusy || verifyBusy}
                      onClick={() => setVerifyImage(null)}
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="td-journal-verify-drop-title">{verifyPrepBusy ? 'Preparing image…' : 'Drop screenshot here'}</p>
                  <div className="td-journal-verify-tools">
                    <button
                      type="button"
                      className="td-journal-modal-btn primary"
                      disabled={verifyPrepBusy || verifyBusy}
                      onClick={() => verifyCameraRef.current?.click()}
                    >
                      {verifyPrepBusy ? 'Working…' : 'Camera / photo'}
                    </button>
                    <button
                      type="button"
                      className="td-journal-modal-btn"
                      disabled={verifyPrepBusy || verifyBusy}
                      onClick={() => verifyFileRef.current?.click()}
                    >
                      Choose file
                    </button>
                  </div>
                </>
              )}
            </div>
            <input
              ref={verifyFileRef}
              type="file"
              className="td-journal-sr-only"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void applyVerifyFile(f);
              }}
            />
            <input
              ref={verifyCameraRef}
              type="file"
              className="td-journal-sr-only"
              accept="image/*"
              capture="environment"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void applyVerifyFile(f);
              }}
            />
            <div className="td-journal-modal-actions">
              <button
                type="button"
                className="td-journal-modal-btn primary"
                onClick={submitVerify}
                disabled={verifyBusy || verifyPrepBusy || !verifyImage?.dataUrl}
              >
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
