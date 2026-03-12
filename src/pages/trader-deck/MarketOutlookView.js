/**
 * Market Outlook content for Trader Deck – date-scoped Daily or Weekly.
 * Same panels as the main dashboard; data from API for selected date or live/seed fallback.
 */
import React, { useState, useEffect } from 'react';
import Api from '../../services/Api';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import DashboardPanel from '../../components/trader-deck/DashboardPanel';
import RegimeRows from '../../components/trader-deck/RegimeRows';
import MarketPulseGauge from '../../components/trader-deck/MarketPulseGauge';
import DriverList from '../../components/trader-deck/DriverList';
import SignalList from '../../components/trader-deck/SignalList';
import ChangeList from '../../components/trader-deck/ChangeList';
import FocusList from '../../components/trader-deck/FocusList';
import RiskRadarList from '../../components/trader-deck/RiskRadarList';

function normalizeForUI(data) {
  if (!data) return null;
  const regime = data.marketRegime;
  const pulse = data.marketPulse;
  const drivers = (data.keyDrivers || []).map((d) => ({
    name: d.name || d.title || '',
    direction: (d.direction || 'neutral').toLowerCase(),
    impact: typeof d.impact === 'string' ? d.impact.toLowerCase() : (d.impact || 'medium'),
  }));
  const signals = (data.crossAssetSignals || []).map((s) => ({
    asset: s.asset || '',
    signal: s.signal || s.label || '—',
    direction: (s.direction || 'neutral').toLowerCase(),
  }));
  return {
    marketRegime: regime,
    marketPulse: {
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null ? (pulse.score ?? pulse.value) : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    traderFocus: data.traderFocus || [],
    riskRadar: data.riskRadar || [],
    riskRadarDate: data.riskRadarDate || null,
    updatedAt: data.updatedAt,
  };
}

const impactOptions = ['high', 'medium', 'low'];
const directionOptions = ['up', 'down', 'neutral'];

export default function MarketOutlookView({ selectedDate, period, canEdit }) {
  const type = period === 'weekly' ? 'outlook-weekly' : 'outlook-daily';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveSuccess(null);
    const dateStr = String(selectedDate).trim().slice(0, 10);
    Api.getTraderDeckContent(type, dateStr)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.payload;
        if (payload && typeof payload === 'object') {
          setData(normalizeForUI(payload));
          return;
        }
        return getMarketIntelligence().then((raw) => {
          if (cancelled) return;
          const normalized = normalizeForUI(raw) || normalizeForUI(SEED_MARKET_INTELLIGENCE);
          setData(normalized);
        });
      })
      .catch(() => {
        if (cancelled) return;
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE);
        setData(normalized);
        setError('Using fallback data');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, [type, selectedDate]);

  const handleEditToggle = () => {
    if (editMode) {
      setEditMode(false);
      setEditDraft(null);
      return;
    }
    const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE);
    const toStr = (x) => (typeof x === 'string' ? x : (x && (x.title || x.text || x.description)) || '');
    setEditDraft({
      marketRegime: { ...ui.marketRegime },
      marketPulse: { score: ui.marketPulse.score, label: ui.marketPulse.label },
      keyDrivers: (ui.keyDrivers || []).map((d) => ({ ...d, name: d.name || d.title })),
      crossAssetSignals: (ui.crossAssetSignals || []).map((s) => ({ ...s })),
      marketChangesToday: (ui.marketChangesToday || []).map(toStr),
      traderFocus: (ui.traderFocus || []).map(toStr),
      riskRadar: (ui.riskRadar || []).map(toStr),
    });
    setEditMode(true);
  };

  const handleSave = () => {
    if (!editDraft) return;
    const dateStr = String(selectedDate).trim().slice(0, 10);
    const payload = {
      marketRegime: editDraft.marketRegime,
      marketPulse: { score: editDraft.marketPulse.score, label: editDraft.marketPulse.label },
      keyDrivers: editDraft.keyDrivers,
      crossAssetSignals: editDraft.crossAssetSignals,
      marketChangesToday: editDraft.marketChangesToday,
      traderFocus: editDraft.traderFocus,
      riskRadar: editDraft.riskRadar,
      riskRadarDate: dateStr,
      updatedAt: new Date().toISOString(),
    };
    setError(null);
    setSaveSuccess(null);
    Api.putTraderDeckContent(type, dateStr, payload)
      .then(() => {
        setData(normalizeForUI(payload));
        setEditMode(false);
        setEditDraft(null);
        setSaveSuccess(`Saved for ${dateStr}`);
        setTimeout(() => setSaveSuccess(null), 3000);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to save'));
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditDraft(null);
  };

  if (loading && !data) {
    return (
      <div className="td-mi-loading td-mi-loading--page">
        <div className="td-mi-loading-pulse" aria-hidden />
        <p>Loading {period} outlook…</p>
      </div>
    );
  }

  const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE);
  const showing = editMode && editDraft ? editDraft : ui;
  const {
    marketRegime,
    marketPulse,
    keyDrivers,
    crossAssetSignals,
    marketChangesToday,
    traderFocus,
    riskRadar,
  } = showing;

  const renderRegime = () => {
    if (editMode && editDraft) {
      const r = editDraft.marketRegime || {};
      return (
        <div className="td-mi-regime-rows td-mi-edit">
          {['currentRegime', 'primaryDriver', 'secondaryDriver', 'marketSentiment'].map((key) => (
            <div key={key} className="td-mi-regime-row">
              <label className="td-mi-regime-label">
                {key === 'currentRegime' && 'Current Regime'}
                {key === 'primaryDriver' && 'Primary Driver'}
                {key === 'secondaryDriver' && 'Secondary Driver'}
                {key === 'marketSentiment' && 'Market Sentiment'}
              </label>
              <input
                type="text"
                className="td-mi-edit-input"
                value={r[key] || ''}
                onChange={(e) => setEditDraft((d) => ({ ...d, marketRegime: { ...d.marketRegime, [key]: e.target.value } }))}
              />
            </div>
          ))}
        </div>
      );
    }
    return <RegimeRows regime={marketRegime} />;
  };

  const renderPulse = () => {
    if (editMode && editDraft) {
      const p = editDraft.marketPulse || { score: 50, label: 'NEUTRAL' };
      return (
        <div className="td-mi-edit">
          <label className="td-mi-edit-label">Score (0–100)</label>
          <input type="range" min="0" max="100" value={p.score}
            onChange={(e) => setEditDraft((d) => ({ ...d, marketPulse: { ...d.marketPulse, score: Number(e.target.value), label: p.label } }))}
            className="td-mi-edit-range" />
          <span className="td-mi-edit-value">{p.score}</span>
          <label className="td-mi-edit-label">Label</label>
          <input type="text" className="td-mi-edit-input" value={p.label || ''}
            onChange={(e) => setEditDraft((d) => ({ ...d, marketPulse: { ...d.marketPulse, label: e.target.value } }))} />
        </div>
      );
    }
    return <MarketPulseGauge score={marketPulse.score} label={marketPulse.label} />;
  };

  const renderListEdit = (list, key, placeholder) => (
    <ul className="td-mi-bullets">
      {(list || []).map((item, i) => (
        <li key={i} className="td-mi-bullet-item">
          <input type="text" className="td-mi-edit-input td-mi-edit-inline"
            value={typeof item === 'string' ? item : (item.title || item.text || '')}
            onChange={(e) => {
              const next = [...(editDraft[key] || [])];
              next[i] = e.target.value;
              setEditDraft((d) => ({ ...d, [key]: next }));
            }}
            placeholder={placeholder} />
        </li>
      ))}
      <li>
        <button type="button" className="td-mi-btn td-mi-btn-small"
          onClick={() => setEditDraft((d) => ({ ...d, [key]: [...(d[key] || []), ''] }))}>+ Add</button>
      </li>
    </ul>
  );

  const renderDriversEdit = () => (
    <div className="td-mi-edit td-mi-edit--drivers">
      <ul className="td-mi-list td-mi-list--drivers">
        {(editDraft.keyDrivers || []).map((d, i) => (
          <li key={i} className="td-mi-list-item td-mi-list-item--edit">
            <input type="text" className="td-mi-edit-input td-mi-edit-driver-name" value={d.name || ''}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], name: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }} placeholder="Driver name" />
            <select className="td-mi-edit-select" value={d.impact || 'medium'}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], impact: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }} aria-label="Impact">
              {impactOptions.map((opt) => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)} Impact</option>)}
            </select>
            <select className="td-mi-edit-select td-mi-edit-select--dir" value={d.direction || 'neutral'}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], direction: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }} aria-label="Direction">
              {directionOptions.map((o) => <option key={o} value={o}>{o === 'neutral' ? 'Neutral' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
            <button type="button" className="td-mi-btn td-mi-btn-remove"
              onClick={() => setEditDraft((x) => ({ ...x, keyDrivers: (x.keyDrivers || []).filter((_, j) => j !== i) }))} aria-label="Remove">×</button>
          </li>
        ))}
      </ul>
      <button type="button" className="td-mi-btn td-mi-btn-small"
        onClick={() => setEditDraft((d) => ({ ...d, keyDrivers: [...(d.keyDrivers || []), { name: '', impact: 'medium', direction: 'neutral' }] }))}>+ Add driver</button>
    </div>
  );

  const renderSignalsEdit = () => (
    <div className="td-mi-edit td-mi-edit--signals">
      <ul className="td-mi-list td-mi-list--signals">
        {(editDraft.crossAssetSignals || []).map((s, i) => (
          <li key={i} className="td-mi-list-item td-mi-list-item--edit">
            <input type="text" className="td-mi-edit-input td-mi-edit-signal-asset" value={s.asset || ''}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], asset: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }} placeholder="Asset" />
            <input type="text" className="td-mi-edit-input td-mi-edit-signal-value" value={s.signal || ''}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], signal: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }} placeholder="Signal" />
            <select className="td-mi-edit-select td-mi-edit-select--dir" value={s.direction || 'neutral'}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], direction: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }} aria-label="Direction">
              {directionOptions.map((o) => <option key={o} value={o}>{o === 'neutral' ? 'Neutral' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
            <button type="button" className="td-mi-btn td-mi-btn-remove"
              onClick={() => setEditDraft((x) => ({ ...x, crossAssetSignals: (x.crossAssetSignals || []).filter((_, j) => j !== i) }))} aria-label="Remove">×</button>
          </li>
        ))}
      </ul>
      <button type="button" className="td-mi-btn td-mi-btn-small"
        onClick={() => setEditDraft((d) => ({ ...d, crossAssetSignals: [...(d.crossAssetSignals || []), { asset: '', signal: '—', direction: 'neutral' }] }))}>+ Add signal</button>
    </div>
  );

  const periodLabel = period === 'weekly' ? 'Weekly' : 'Daily';
  const displayDate = (() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return isNaN(d.getTime()) ? selectedDate : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  })();
  const mainTitle = `Market Outlook — ${periodLabel} (${displayDate})`;

  return (
    <>
      {error && <p className="td-mi-fallback-msg" role="status">{error}</p>}
      {saveSuccess && <p className="td-mi-save-success" role="status">{saveSuccess}</p>}
      <div className="td-outlook-dashboard">
        <aside className="td-outlook-sidebar" aria-label="Market summary">
          <DashboardPanel title="▲ Aurax Market Regime" className="td-mi-panel--regime td-outlook-card">{renderRegime()}</DashboardPanel>
          <DashboardPanel title="Aurax Market Pulse" className="td-mi-panel--pulse td-outlook-card td-outlook-card--pulse">{renderPulse()}</DashboardPanel>
          <DashboardPanel title="Key Market Drivers" className="td-mi-panel--drivers td-outlook-card">
            {editMode && editDraft ? renderDriversEdit() : <><p className="td-mi-source td-mi-source--readonly">Source: FRED, Finnhub &amp; FMP</p><DriverList drivers={keyDrivers} /></>}
          </DashboardPanel>
          <DashboardPanel title="Cross-Asset Signals" className="td-mi-panel--signals td-outlook-card">
            {editMode && editDraft ? renderSignalsEdit() : <><p className="td-mi-source td-mi-source--readonly">Source: FRED, Finnhub &amp; FMP</p><SignalList signals={crossAssetSignals} /></>}
          </DashboardPanel>
        </aside>
        <div className="td-outlook-main">
          <div className="td-outlook-main-card">
            <header className="td-outlook-main-header">
              <h1 className="td-outlook-main-title">{mainTitle}</h1>
              {canEdit && (
                <div className="td-mi-shell-actions">
                  {!editMode ? (
                    <button type="button" className="td-mi-btn td-mi-btn-edit" onClick={handleEditToggle} aria-label="Edit content">Edit</button>
                  ) : (
                    <>
                      <button type="button" className="td-mi-btn td-mi-btn-save" onClick={handleSave}>Save</button>
                      <button type="button" className="td-mi-btn td-mi-btn-cancel" onClick={handleCancel}>Cancel</button>
                    </>
                  )}
                </div>
              )}
            </header>
            <div className="td-outlook-divider" aria-hidden />
            <div className="td-outlook-sections">
              <section className="td-outlook-section" aria-labelledby="outlook-changes-heading">
                <h2 id="outlook-changes-heading" className="td-outlook-section-title">Market Change Today</h2>
                <div className="td-outlook-section-body">
                  {editMode && editDraft ? renderListEdit(editDraft.marketChangesToday, 'marketChangesToday', 'Theme') : (marketChangesToday && marketChangesToday.length > 0 ? <ChangeList items={marketChangesToday} /> : <p className="td-outlook-empty">No themes recorded. Use Edit to add.</p>)}
                </div>
              </section>
              <section className="td-outlook-section" aria-labelledby="outlook-focus-heading">
                <h2 id="outlook-focus-heading" className="td-outlook-section-title">Trader Focus</h2>
                <div className="td-outlook-section-body">
                  {editMode && editDraft ? renderListEdit(editDraft.traderFocus, 'traderFocus', 'Focus item') : (traderFocus && traderFocus.length > 0 ? <FocusList items={traderFocus} /> : <p className="td-outlook-empty">No focus items. Use Edit to add.</p>)}
                </div>
              </section>
              <section className="td-outlook-section" aria-labelledby="outlook-radar-heading">
                <h2 id="outlook-radar-heading" className="td-outlook-section-title">Risk Radar</h2>
                <div className="td-outlook-section-body">
                  {editMode && editDraft ? renderListEdit(editDraft.riskRadar, 'riskRadar', 'News event') : (
                    <>
                      <p className="td-mi-source td-mi-source--readonly">Upcoming news (FMP). Refreshes at midnight.</p>
                      {riskRadar && riskRadar.length > 0 ? <RiskRadarList items={riskRadar} /> : <p className="td-outlook-empty">No upcoming events. Use Edit to add.</p>}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
