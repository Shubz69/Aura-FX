import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AuraAnalysisProvider,
  useAuraAnalysisData,
  useAuraAnalysisMetrics,
  DATE_RANGE_OPTIONS,
} from '../../context/AuraAnalysisContext';
import {
  isAuraAnalysisDevPerfEnabled,
  auraAnalysisDevPerfRenderMarkOnce,
} from '../../lib/aura-analysis/auraAnalysisDevPerf';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/aura-analysis/AuraDashboard.css';

const TABS = [
  { path: 'overview',      label: 'Overview' },
  { path: 'performance',   label: 'Performance' },
  { path: 'risk-lab',      label: 'Risk Lab' },
  { path: 'edge-analyzer', label: 'Edge Analyzer' },
  { path: 'execution-lab', label: 'Execution Lab' },
  { path: 'calendar',      label: 'Calendar' },
  { path: 'psychology',    label: 'Psychology' },
  { path: 'habits',        label: 'Habits' },
  { path: 'growth',        label: 'Growth' },
  { path: 'trader-replay', label: 'Trader Replay' },
];

const base = '/aura-analysis/dashboard';

/** Filter + refresh bar — rendered inside the provider so it can read context */
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SESSION_FILTER_OPTIONS = ['ALL', 'Asian', 'London', 'New York', 'NY Close', 'Unknown'];

function AuraFilterBar() {
  const {
    daysFilter, setDaysFilter,
    customRange, setCustomRange,
    symbolFilter, setSymbolFilter, symbolOptions,
    sessionFilter, setSessionFilter,
    dirFilter, setDirFilter,
    filterPresets, saveCurrentFilterPreset, applyFilterPreset, removeFilterPreset,
    refreshing, lastUpdatedStr, refresh,
    activePlatformId, activeConnectionId, connections, setActivePlatformId, setActiveConnectionId,
  } = useAuraAnalysisData();

  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [presetDraft, setPresetDraft] = useState('');
  const customWrapRef = useRef(null);

  useEffect(() => {
    if (!customOpen) return undefined;
    const onDoc = (e) => {
      if (customWrapRef.current && !customWrapRef.current.contains(e.target)) {
        setCustomOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [customOpen]);

  const openCustomPanel = () => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    if (customRange?.from && customRange?.to) {
      setDraftFrom(customRange.from);
      setDraftTo(customRange.to);
    } else {
      setDraftFrom(ymdLocal(from));
      setDraftTo(ymdLocal(to));
    }
    setCustomOpen(true);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    setCustomRange({ from: draftFrom, to: draftTo });
    setCustomOpen(false);
  };

  const todayYmd = ymdLocal(new Date());

  return (
    <div className="aura-db-filterbar">
      <div className="aura-db-filterbar-inner">

        {/* Account selector (for multi-account MT4/MT5) */}
        {connections.length > 1 && (
          <select
            className="aura-db-filter-select"
            value={String(activeConnectionId || '')}
            onChange={e => {
              const selected = connections.find((c) => String(c.connectionId) === e.target.value);
              if (!selected) return;
              setActiveConnectionId(selected.connectionId);
              setActivePlatformId(selected.platformId);
            }}
            title="Active account"
          >
            {connections.map(c => (
              <option key={String(c.connectionId || `${c.platformId}:${c.label}`)} value={String(c.connectionId || '')}>
                {(c.label || c.platformId || 'Account')}
              </option>
            ))}
          </select>
        )}

        {/* Date range */}
        <div className="aura-db-filter-pills">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.label}
              type="button"
              className={`aura-db-filter-pill${!customRange && daysFilter === opt.days ? ' active' : ''}`}
              onClick={() => { setCustomRange(null); setDaysFilter(opt.days); }}
            >
              {opt.label}
            </button>
          ))}
          <div className="aura-db-custom-range" ref={customWrapRef}>
            <button
              type="button"
              className={`aura-db-filter-pill aura-db-filter-pill--custom${customRange ? ' active' : ''}${customOpen ? ' open' : ''}`}
              onClick={() => (customOpen ? setCustomOpen(false) : openCustomPanel())}
              aria-expanded={customOpen}
            >
              Custom
            </button>
            {customOpen && (
              <div className="aura-db-custom-range-pop" role="dialog" aria-label="Custom date range">
                <div className="aura-db-custom-range-fields">
                  <label className="aura-db-custom-field">
                    <span className="aura-db-custom-field-label">From</span>
                    <input
                      type="date"
                      className="aura-db-custom-date-input"
                      value={draftFrom}
                      max={todayYmd}
                      onChange={e => setDraftFrom(e.target.value)}
                    />
                  </label>
                  <label className="aura-db-custom-field">
                    <span className="aura-db-custom-field-label">To</span>
                    <input
                      type="date"
                      className="aura-db-custom-date-input"
                      value={draftTo}
                      max={todayYmd}
                      onChange={e => setDraftTo(e.target.value)}
                    />
                  </label>
                </div>
                <div className="aura-db-custom-range-actions">
                  <button type="button" className="aura-db-custom-apply" onClick={applyCustom}>
                    Apply
                  </button>
                  <button
                    type="button"
                    className="aura-db-custom-cancel"
                    onClick={() => setCustomOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Symbol filter */}
        {symbolOptions.length > 2 && (
          <select
            className="aura-db-filter-select"
            value={symbolFilter}
            onChange={e => setSymbolFilter(e.target.value)}
            title="Filter by symbol"
          >
            {symbolOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <select
          className="aura-db-filter-select"
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          title="Filter by session (UTC)"
        >
          {SESSION_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'Session · All' : s}</option>
          ))}
        </select>

        <select
          className="aura-db-filter-select"
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          title="Filter by direction"
        >
          <option value="ALL">Dir · All</option>
          <option value="buy">Long</option>
          <option value="sell">Short</option>
        </select>

        {filterPresets?.length > 0 && (
          <select
            className="aura-db-filter-select"
            defaultValue=""
            onChange={(e) => {
              const name = e.target.value;
              if (!name) return;
              const p = filterPresets.find((x) => x.name === name);
              if (p) applyFilterPreset(p);
              e.target.value = '';
            }}
            title="Apply saved filter view"
          >
            <option value="">Saved views…</option>
            {filterPresets.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="aura-db-filter-preset-save" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            className="aura-db-filter-select"
            style={{ width: 120, maxWidth: '28vw' }}
            placeholder="Save view as…"
            value={presetDraft}
            onChange={(e) => setPresetDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveCurrentFilterPreset(presetDraft);
                setPresetDraft('');
              }
            }}
            title="Name this filter set, then Save or press Enter"
          />
          <button
            type="button"
            className="aura-db-refresh-btn"
            style={{ width: 'auto', minWidth: 44, padding: '0 10px', fontSize: '0.62rem', fontWeight: 700 }}
            onClick={() => {
              saveCurrentFilterPreset(presetDraft);
              setPresetDraft('');
            }}
            title="Save current filters and date range"
          >
            Save
          </button>
          {filterPresets?.length > 0 && (
            <select
              className="aura-db-filter-select"
              defaultValue=""
              onChange={(e) => {
                const name = e.target.value;
                if (name) removeFilterPreset(name);
                e.target.value = '';
              }}
              title="Delete a saved view"
            >
              <option value="">Delete view…</option>
              {filterPresets.map((p) => (
                <option key={`del-${p.name}`} value={p.name}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Refresh + last-updated */}
        <div className="aura-db-refresh-group">
          {lastUpdatedStr && (
            <span className="aura-db-last-updated">
              <i className="fas fa-clock" /> {lastUpdatedStr}
            </span>
          )}
          <button
            type="button"
            className={`aura-db-refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={refresh}
            disabled={refreshing}
            title="Refresh data"
          >
            <i className="fas fa-sync-alt" />
          </button>
        </div>

      </div>
    </div>
  );
}

function AuraDashboardInner() {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const {
    loading,
    error,
    account,
    rawTrades,
    dataMode,
    csvPeriod,
  } = useAuraAnalysisData();
  const { analyticsDataKey } = useAuraAnalysisMetrics();
  const prevLoadingPerfRef = useRef(/** @type {boolean | null} */ (null));
  const tabPerfKeyRef = useRef('');

  useLayoutEffect(() => {
    if (!isAuraAnalysisDevPerfEnabled()) return;
    const was = prevLoadingPerfRef.current;
    const now = loading;
    if (was !== false && now === false && !error && (account != null || rawTrades.length > 0)) {
      auraAnalysisDevPerfRenderMarkOnce('render.firstUsable');
    }
    prevLoadingPerfRef.current = now;
  }, [loading, error, account, rawTrades.length]);

  useLayoutEffect(() => {
    if (!isAuraAnalysisDevPerfEnabled() || loading) return;
    const tab = location.pathname.replace(`${base}/`, '') || 'overview';
    const k = `${tab}|${analyticsDataKey}`;
    if (tabPerfKeyRef.current === k) return;
    tabPerfKeyRef.current = k;
    auraAnalysisDevPerfRenderMarkOnce('render.activeTab', { tab });
  }, [location.pathname, loading, analyticsDataKey]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rawTab = location.pathname.replace(`${base}/`, '') || 'overview';
  const tabSeg = rawTab.split('/')[0] || 'overview';
  const activeTabPath = TABS.some((t) => t.path === tabSeg) ? tabSeg : 'overview';
  const noDataYet = !loading && !error && !account && (!rawTrades || rawTrades.length === 0);
  const isCsvMode = dataMode === 'csv';
  const csvQuery = isCsvMode
    ? `?source=csv${csvPeriod?.year ? `&year=${encodeURIComponent(String(csvPeriod.year))}` : ''}${csvPeriod?.month ? `&month=${encodeURIComponent(String(csvPeriod.month))}` : ''}`
    : '';
  const backHref = isCsvMode ? '/manual-metrics' : '/aura-analysis/ai';
  const brandTitle = isCsvMode ? 'Back to Manual Metrics' : 'Back to Connection Hub';

  return (
    <div className="aura-dashboard journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">

      {/* ══ Primary Tab Header ══ */}
      <div className="aura-dashboard-tabs-wrap">
        <div className="aura-dashboard-tabs-inner">
          <Link to={backHref} className="aura-dashboard-brand" title={brandTitle}>
            <span className="aura-db-brand-slash">/</span>
            <span className="aura-db-brand-name">AURA TERMINAL™</span>
          </Link>

          <nav className="aura-dashboard-tabs" aria-label="Aura Analysis dashboard sections">
            {TABS.map(({ path, label }) => (
              <NavLink
                key={path}
                to={`${base}/${path}${csvQuery}`}
                className={({ isActive }) => `aura-dashboard-tab${isActive ? ' active' : ''}`}
                end={path === 'overview'}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="aura-dashboard-tab-select-wrap" aria-label="Dashboard section selector">
            <select
              className="aura-dashboard-tab-select"
              value={activeTabPath}
              onChange={(e) => navigate(`${base}/${e.target.value}${csvQuery}`)}
            >
              {TABS.map(({ path, label }) => (
                <option key={path} value={path}>{label}</option>
              ))}
            </select>
          </div>

          <div className="aura-db-right" title={`${dateStr} · local time`}>
            <div className="aura-db-clock" aria-label={`Local time ${timeStr}, ${dateStr}`}>
              <span className="aura-db-time">{timeStr}</span>
              <span className="aura-db-date">{dateStr}</span>
            </div>
            <div className="aura-db-live-pill" title="Live data">
              <span className="aura-db-status-dot" aria-hidden="true" />
              <span className="aura-db-status-label">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Filter / Refresh bar ══ */}
      <AuraFilterBar />

      {/* ══ Content ══ */}
      <main className="aura-dashboard-content">
        {loading && (
          <div className="aura-db-warn-banner" role="status">
            Loading dashboard data…
          </div>
        )}
        {!!error && (
          <div className="aura-db-warn-banner aura-db-warn-banner--strong" role="alert">
            {error}
          </div>
        )}
        {noDataYet && (
          <div className="aura-db-warn-banner" role="status">
            {isCsvMode
              ? 'No CSV snapshot found for this period. Upload a CSV in Manual Metrics and re-enter the dashboard.'
              : 'Dashboard is ready, but no synced account data is available yet. Connect MetaTrader in Connection Hub, then refresh.'}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

export default function AuraDashboardLayout() {
  const [searchParams] = useSearchParams();
  const csvMode = searchParams.get('source') === 'csv';
  const csvYear = Number(searchParams.get('year'));
  const csvMonth = Number(searchParams.get('month'));
  const csvPeriod =
    Number.isFinite(csvYear) && Number.isFinite(csvMonth) && csvMonth >= 1 && csvMonth <= 12
      ? { year: csvYear, month: csvMonth }
      : null;
  return (
    <AuraAnalysisProvider dataMode={csvMode ? 'csv' : 'live'} csvPeriod={csvPeriod}>
      <AuraTerminalThemeShell>
        <AuraDashboardInner />
      </AuraTerminalThemeShell>
    </AuraAnalysisProvider>
  );
}
