import React, { useState, useEffect } from 'react';
import CosmicBackground from '../../components/CosmicBackground';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../utils/roles';
import TraderDeckDashboardShell from '../../components/trader-deck/TraderDeckDashboardShell';
import DashboardPanel from '../../components/trader-deck/DashboardPanel';
import RegimeRows from '../../components/trader-deck/RegimeRows';
import MarketPulseGauge from '../../components/trader-deck/MarketPulseGauge';
import DriverList from '../../components/trader-deck/DriverList';
import SignalList from '../../components/trader-deck/SignalList';
import ChangeList from '../../components/trader-deck/ChangeList';
import FocusList from '../../components/trader-deck/FocusList';
import RiskRadarList from '../../components/trader-deck/RiskRadarList';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import '../../styles/TraderDeckMarket.css';

const STORAGE_KEY = 'trader-deck-market-intelligence';

function normalizeForUI(data) {
  if (!data) return null;
  const regime = data.marketRegime;
  const pulse = data.marketPulse;
  const drivers = (data.keyDrivers || []).map((d) => ({
    name: d.name || d.title,
    direction: d.direction || 'neutral',
    impact: d.impact,
  }));
  const signals = (data.crossAssetSignals || []).map((s) => ({
    asset: s.asset,
    signal: s.signal || s.label,
    direction: s.direction || 'neutral',
  }));
  return {
    marketRegime: regime,
    marketPulse: {
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null
        ? (pulse.score ?? pulse.value)
        : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    traderFocus: data.traderFocus || [],
    riskRadar: data.riskRadar || [],
    updatedAt: data.updatedAt,
  };
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeForUI(parsed);
  } catch {
    return null;
  }
}

function saveToStorage(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Trader Deck: could not save to localStorage', e);
  }
}

export default function MarketIntelligenceDashboard({ embedded }) {
  const { user } = useAuth();
  const canEdit = isAdmin(user);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMarketIntelligence()
      .then((raw) => {
        const normalized = normalizeForUI(raw) || normalizeForUI(SEED_MARKET_INTELLIGENCE);
        const saved = loadSaved();
        setData(saved || normalized);
      })
      .catch(() => {
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE);
        const saved = loadSaved();
        setData(saved || normalized);
        setError('Using fallback data');
      })
      .finally(() => setLoading(false));
  }, []);

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
    const payload = {
      marketRegime: editDraft.marketRegime,
      marketPulse: { score: editDraft.marketPulse.score, label: editDraft.marketPulse.label },
      keyDrivers: editDraft.keyDrivers,
      crossAssetSignals: editDraft.crossAssetSignals,
      marketChangesToday: editDraft.marketChangesToday,
      traderFocus: editDraft.traderFocus,
      riskRadar: editDraft.riskRadar,
      updatedAt: new Date().toISOString(),
    };
    const normalized = normalizeForUI(payload);
    setData(normalized);
    saveToStorage(payload);
    setEditMode(false);
    setEditDraft(null);
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditDraft(null);
  };

  if (loading && !data) {
    if (embedded) {
      return (
        <div className="td-mi td-mi--embedded">
          <div className="td-mi-loading">
            <div className="td-mi-loading-pulse" aria-hidden />
            <p>Loading market intelligence…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="td-mi td-mi--page">
        <CosmicBackground />
        <div className="td-mi-loading td-mi-loading--page">
          <div className="td-mi-loading-pulse" aria-hidden />
          <p>Loading market intelligence…</p>
        </div>
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
    updatedAt,
  } = showing;

  const updatedLabel = (editMode ? editDraft?.updatedAt : updatedAt)
    ? new Date(editMode ? editDraft.updatedAt : updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  const renderRegime = () => {
    if (editMode && editDraft) {
      const r = editDraft.marketRegime || {};
      return (
        <div className="td-mi-regime-rows td-mi-edit">
          {['currentRegime', 'primaryDriver', 'secondaryDriver', 'marketSentiment'].map((key, i) => (
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
                onChange={(e) => setEditDraft((d) => ({
                  ...d,
                  marketRegime: { ...d.marketRegime, [key]: e.target.value },
                }))}
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
          <input
            type="range"
            min="0"
            max="100"
            value={p.score}
            onChange={(e) => setEditDraft((d) => ({
              ...d,
              marketPulse: { ...d.marketPulse, score: Number(e.target.value), label: p.label },
            }))}
            className="td-mi-edit-range"
          />
          <span className="td-mi-edit-value">{p.score}</span>
          <label className="td-mi-edit-label">Label</label>
          <input
            type="text"
            className="td-mi-edit-input"
            value={p.label || ''}
            onChange={(e) => setEditDraft((d) => ({
              ...d,
              marketPulse: { ...d.marketPulse, label: e.target.value },
            }))}
          />
        </div>
      );
    }
    return <MarketPulseGauge score={marketPulse.score} label={marketPulse.label} />;
  };

  const renderListEdit = (list, key, placeholder) => (
    <ul className="td-mi-bullets">
      {(list || []).map((item, i) => (
        <li key={i} className="td-mi-bullet-item">
          <input
            type="text"
            className="td-mi-edit-input td-mi-edit-inline"
            value={typeof item === 'string' ? item : (item.title || item.text || '')}
            onChange={(e) => {
              const next = [...(editDraft[key] || [])];
              next[i] = e.target.value;
              setEditDraft((d) => ({ ...d, [key]: next }));
            }}
            placeholder={placeholder}
          />
        </li>
      ))}
      <li>
        <button
          type="button"
          className="td-mi-btn td-mi-btn-small"
          onClick={() => setEditDraft((d) => ({ ...d, [key]: [...(d[key] || []), ''] }))}
        >
          + Add
        </button>
      </li>
    </ul>
  );

  const content = (
    <>
      {error && (
        <p className="td-mi-fallback-msg" role="status">
          {error}
        </p>
      )}
      <TraderDeckDashboardShell
        title="Trader Deck"
        canEdit={canEdit}
        editMode={editMode}
        onEditToggle={handleEditToggle}
        onSave={handleSave}
        onCancel={handleCancel}
      >
        <DashboardPanel title="▲ Aurax Market Regime" className="td-mi-panel--regime">
          {renderRegime()}
        </DashboardPanel>
        <DashboardPanel title="Aurax Market Pulse" className="td-mi-panel--pulse">
          {renderPulse()}
        </DashboardPanel>

        <DashboardPanel title="Key Market Drivers" className="td-mi-panel--drivers">
          <DriverList drivers={keyDrivers} />
        </DashboardPanel>
        <DashboardPanel title="Cross-Asset Signals" className="td-mi-panel--signals">
          <SignalList signals={crossAssetSignals} />
        </DashboardPanel>
        <DashboardPanel title="Market Change Today" className="td-mi-panel--changes">
          {editMode && editDraft ? renderListEdit(editDraft.marketChangesToday, 'marketChangesToday', 'Theme') : <ChangeList items={marketChangesToday} />}
        </DashboardPanel>

        <DashboardPanel title="Trader Focus" wide className="td-mi-panel--focus">
          {editMode && editDraft ? renderListEdit(editDraft.traderFocus, 'traderFocus', 'Focus item') : <FocusList items={traderFocus} />}
        </DashboardPanel>
        <DashboardPanel title="Risk Radar" wide className="td-mi-panel--radar">
          {editMode && editDraft ? renderListEdit(editDraft.riskRadar, 'riskRadar', 'Event') : <RiskRadarList items={riskRadar} />}
        </DashboardPanel>
      </TraderDeckDashboardShell>
      {updatedLabel && !editMode && (
        <p className="td-mi-updated">Updated {updatedLabel}</p>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="td-mi td-mi--embedded">
        {content}
      </div>
    );
  }

  return (
    <div className="td-mi td-mi--page">
      <CosmicBackground />
      <div className="td-mi-page-inner">
        {content}
      </div>
    </div>
  );
}
