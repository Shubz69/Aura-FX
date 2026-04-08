import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Api from '../../services/Api';
import { toast } from 'react-toastify';
import TradeReviewDrawer from '../../components/backtesting/TradeReviewDrawer';
import { BacktestingEmptyState, GradeBadge, TagPills } from '../../components/backtesting/BacktestingSharedUi';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/backtesting/Backtesting.css';

function fmtNum(x, d = 2) {
  if (x == null || Number.isNaN(Number(x))) return '—';
  return Number(x).toFixed(d);
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso).slice(0, 16);
  }
}

const SORTS = [
  { id: 'close_desc', label: 'Close time (newest)' },
  { id: 'close_asc', label: 'Close time (oldest)' },
  { id: 'pnl_desc', label: 'PnL (high → low)' },
  { id: 'pnl_asc', label: 'PnL (low → high)' },
  { id: 'r_desc', label: 'R (high → low)' },
];

export default function BacktestingTrades() {
  const [trades, setTrades] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [instrument, setInstrument] = useState('');
  const [playbookId, setPlaybookId] = useState('');
  const [search, setSearch] = useState('');
  const [sortId, setSortId] = useState('close_desc');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [drawerTrade, setDrawerTrade] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (sessionId.trim()) params.sessionId = sessionId.trim();
      if (instrument.trim()) params.instrument = instrument.trim();
      if (playbookId.trim()) params.playbookId = playbookId.trim();
      const res = await Api.getBacktestingTrades(params);
      if (res.data?.success) {
        setTrades(res.data.trades || []);
        setSelected(new Set());
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; filters use "Apply filters"
  }, []);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = trades;
    if (q) {
      list = list.filter((t) => {
        const blob = [
          t.instrument,
          t.setupName,
          t.playbookName,
          t.sessionLabel,
          t.notes,
          ...(Array.isArray(t.tags) ? t.tags : []),
          t.sessionId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortId) {
        case 'close_asc':
          return (new Date(a.closeTime || 0) - new Date(b.closeTime || 0));
        case 'pnl_desc':
          return (Number(b.pnlAmount) || 0) - (Number(a.pnlAmount) || 0);
        case 'pnl_asc':
          return (Number(a.pnlAmount) || 0) - (Number(b.pnlAmount) || 0);
        case 'r_desc':
          return (Number(b.rMultiple) || -1e12) - (Number(a.rMultiple) || -1e12);
        case 'close_desc':
        default:
          return (new Date(b.closeTime || 0) - new Date(a.closeTime || 0));
      }
    });
    return sorted;
  }, [trades, search, sortId]);

  const allVisibleSelected = filteredSorted.length > 0 && filteredSorted.every((t) => selected.has(t.id));
  const someSelected = selected.size > 0;

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredSorted.map((t) => t.id)));
    }
  };

  const toggleOne = (id, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDrawer = (t) => {
    setDrawerTrade(t);
    setDrawerOpen(true);
  };

  const mergeTrade = useCallback((updated) => {
    if (!updated?.id) return;
    setTrades((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
    setDrawerTrade((dt) => (dt?.id === updated.id ? { ...dt, ...updated } : dt));
  }, []);

  const removeTrade = useCallback((id) => {
    setTrades((prev) => prev.filter((x) => x.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDrawerTrade((dt) => (dt?.id === id ? null : dt));
  }, []);

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} trade(s)? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const idSet = new Set(ids);
      await Promise.all(ids.map((id) => Api.deleteBacktestingTrade(id)));
      toast.success('Trades deleted');
      setTrades((prev) => prev.filter((t) => !idSet.has(t.id)));
      setSelected(new Set());
      if (drawerTrade && idSet.has(drawerTrade.id)) {
        setDrawerOpen(false);
        setDrawerTrade(null);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Bulk delete failed');
      await load();
    } finally {
      setLoading(false);
    }
  };

  const bulkTag = async () => {
    const raw = window.prompt('Tag to add to all selected trades (single tag)');
    if (raw == null) return;
    const tag = raw.trim();
    if (!tag) {
      toast.error('Empty tag');
      return;
    }
    const ids = [...selected];
    if (!ids.length) return;
    setLoading(true);
    try {
      await Promise.all(
        ids.map((id) => {
          const row = trades.find((t) => t.id === id);
          if (!row) return Promise.resolve();
          const nextTags = [...new Set([...(Array.isArray(row.tags) ? row.tags : []), tag])];
          return Api.patchBacktestingTrade(id, { tags: nextTags });
        })
      );
      toast.success('Tags updated');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Bulk tag failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="bt-page-header">
        <div>
          <h1 className="bt-title">Trade review</h1>
          <p className="bt-subtitle">Full backtest log — filter server-side, refine locally, open any row for detail or edits.</p>
        </div>
        <button type="button" className="bt-btn bt-btn--primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Apply filters'}
        </button>
      </header>

      <div className="aa-card" style={{ marginBottom: 16 }}>
        <div className="aa-section-title" style={{ marginBottom: 12 }}>
          Filters
        </div>
        <div className="bt-form-grid">
          <div>
            <label className="bt-label">Session ID</label>
            <input className="bt-input" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Optional UUID" />
          </div>
          <div>
            <label className="bt-label">Instrument</label>
            <input className="bt-input" value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="e.g. EURUSD" />
          </div>
          <div>
            <label className="bt-label">Playbook ID</label>
            <input className="bt-input" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="bt-label">Search (client)</label>
            <input className="bt-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Setup, notes, tags…" />
          </div>
          <div>
            <label className="bt-label">Sort</label>
            <select className="bt-select" value={sortId} onChange={(e) => setSortId(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {someSelected && (
          <div className="bt-trades-toolbar">
            <div className="bt-trades-bulk">
              <span className="aa-pill aa-pill--accent">{selected.size} selected</span>
              <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={loading} onClick={bulkTag}>
                Add tag…
              </button>
              <button type="button" className="bt-btn bt-btn--danger bt-btn--sm" disabled={loading} onClick={bulkDelete}>
                Delete selected
              </button>
              <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && trades.length === 0 ? (
        <p className="bt-muted">Loading trades…</p>
      ) : !loading && trades.length === 0 ? (
        <BacktestingEmptyState
          title="No trades in this slice"
          hint="Relax filters or log executions from an active backtesting session. Trades appear here after they are saved."
        />
      ) : (
        <div className="bt-table-wrap bt-tr-clickable">
          <table className="bt-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible" />
                </th>
                <th>Close</th>
                <th>Inst</th>
                <th>Dir</th>
                <th>Playbook</th>
                <th>Setup</th>
                <th>TF</th>
                <th>Sess</th>
                <th>PnL</th>
                <th>R</th>
                <th>Chk</th>
                <th>Tags</th>
                <th>Grade</th>
                <th style={{ width: 90 }}> </th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr>
                  <td colSpan={14} className="bt-muted">
                    No trades match search. Clear search or widen filters.
                  </td>
                </tr>
              ) : (
                filteredSorted.map((t) => (
                  <tr key={t.id} onClick={() => openDrawer(t)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => toggleOne(t.id, e)} aria-label="Select trade" />
                    </td>
                    <td>{fmtTime(t.closeTime)}</td>
                    <td>
                      <span className="aa-pill aa-pill--dim">{t.instrument}</span>
                    </td>
                    <td>{t.direction}</td>
                    <td>{t.playbookName || '—'}</td>
                    <td>{t.setupName || '—'}</td>
                    <td>{t.timeframe || '—'}</td>
                    <td>{t.sessionLabel || '—'}</td>
                    <td>{fmtNum(t.pnlAmount)}</td>
                    <td>{fmtNum(t.rMultiple)}</td>
                    <td>{t.checklistScore != null ? `${fmtNum(t.checklistScore, 0)}%` : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <TagPills tags={t.tags} max={4} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <GradeBadge grade={t.qualityGrade} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => openDrawer(t)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <TradeReviewDrawer
        trade={drawerTrade}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerTrade(null);
        }}
        onSaved={mergeTrade}
        onDeleted={removeTrade}
      />
    </>
  );
}
