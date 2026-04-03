import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuraAnalysisProvider, useAuraAnalysis, DATE_RANGE_OPTIONS } from '../../context/AuraAnalysisContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/aura-analysis/AuraDashboard.css';

const TABS = [
  { path: 'overview',      label: 'Overview' },
  { path: 'performance',   label: 'Performance' },
  { path: 'risk-lab',      label: 'Risk Lab' },
  { path: 'edge-analyzer', label: 'Edge Analyzer' },
  { path: 'execution-lab', label: 'Execution Lab' },
  { path: 'calendar',      label: 'Calendar' },
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

function AuraFilterBar() {
  const {
    daysFilter, setDaysFilter,
    customRange, setCustomRange,
    symbolFilter, setSymbolFilter, symbolOptions,
    refreshing, lastUpdatedStr, refresh,
    activePlatformId, connections, setActivePlatformId,
  } = useAuraAnalysis();

  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
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

        {/* Platform selector (only if multiple connections) */}
        {connections.length > 1 && (
          <select
            className="aura-db-filter-select"
            value={activePlatformId || ''}
            onChange={e => setActivePlatformId(e.target.value)}
            title="Active platform"
          >
            {connections.map(c => (
              <option key={c.platformId} value={c.platformId}>
                {c.platformId.toUpperCase()}
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

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const activeTabPath = location.pathname.replace(`${base}/`, '') || 'overview';

  return (
    <div className="aura-dashboard journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim">

      {/* ══ Primary Tab Header ══ */}
      <div className="aura-dashboard-tabs-wrap">
        <div className="aura-dashboard-tabs-inner">
          <Link to="/aura-analysis/ai" className="aura-dashboard-brand" title="Back to Connection Hub">
            <span className="aura-db-brand-slash">/</span>
            <span className="aura-db-brand-name">AURA TERMINAL</span>
          </Link>

          <nav className="aura-dashboard-tabs" aria-label="Aura Analysis dashboard sections">
            {TABS.map(({ path, label }) => (
              <NavLink
                key={path}
                to={`${base}/${path}`}
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
              onChange={(e) => navigate(`${base}/${e.target.value}`)}
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
        <Outlet />
      </main>
    </div>
  );
}

export default function AuraDashboardLayout() {
  return (
    <AuraAnalysisProvider>
      <AuraTerminalThemeShell>
        <AuraDashboardInner />
      </AuraTerminalThemeShell>
    </AuraAnalysisProvider>
  );
}
