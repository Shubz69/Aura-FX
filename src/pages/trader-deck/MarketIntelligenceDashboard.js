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
import MarketDecoderView from './MarketDecoderView';
import '../../styles/TraderDeckMarket.css';
import '../../styles/trader-deck/MarketDecoder.css';

const STORAGE_KEY = 'trader-deck-market-intelligence';

const TODAY_STR = () => new Date().toISOString().slice(0, 10);

function normalizeForUI(data) {
  if (!data) return null;
  const regime = data.marketRegime;
  const pulse = data.marketPulse;
  const drivers = (data.keyDrivers || []).map((d) => ({
    name: d.name || d.title || '',
    direction: (d.direction || 'neutral').toLowerCase(),
    impact: typeof d.impact === 'string' ? d.impact.toLowerCase() : (d.impact || 'medium'),
    effect: d.effect || '',
  }));
  const signals = (data.crossAssetSignals || []).map((s) => ({
    asset: s.asset || '',
    signal: s.signal || s.label || '—',
    direction: (s.direction || 'neutral').toLowerCase(),
  }));
  return {
    marketRegime: regime,
    marketPulse: {
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null
        ? (pulse.score ?? pulse.value)
        : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
      recommendedAction: Array.isArray(pulse?.recommendedAction) ? pulse.recommendedAction : [],
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    traderFocus: data.traderFocus || [],
    riskRadar: data.riskRadar || [],
    riskEngine: data.riskEngine || null,
    riskRadarDate: data.riskRadarDate || null,
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
    console.warn('Trader Desk: could not save to localStorage', e);
  }
}

export default function MarketIntelligenceDashboard({ embedded, mode = 'dashboard' }) {
  const { user } = useAuth();
  const canEdit = isAdmin(user);
  const [internalDecoder, setInternalDecoder] = useState(false);
  const showDecoder = mode === 'decoder' || internalDecoder;

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
        const apiNormalized = normalizeForUI(raw) || normalizeForUI(SEED_MARKET_INTELLIGENCE);
        const saved = loadSaved();
        const todayStr = TODAY_STR();
        let data = saved || apiNormalized;
        // Risk Radar: after midnight use fresh upstream data; during the day use saved if same day
        if (saved && saved.riskRadarDate && saved.riskRadarDate !== todayStr) {
          data = { ...data, riskRadar: apiNormalized.riskRadar || [], riskRadarDate: todayStr };
        } else if (saved && saved.riskRadar) {
          data = { ...data, riskRadarDate: saved.riskRadarDate || todayStr };
        }
        setData(data);
      })
      .catch(() => {
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE);
        const saved = loadSaved();
        const todayStr = TODAY_STR();
        let data = saved || normalized;
        if (saved && saved.riskRadarDate && saved.riskRadarDate !== todayStr) {
          data = { ...data, riskRadar: normalized.riskRadar || [], riskRadarDate: todayStr };
        }
        setData(data);
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
      riskRadarDate: TODAY_STR(),
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

  if (showDecoder) {
    return (
      <div className="td-mi td-mi--embedded">
        {internalDecoder && mode !== 'decoder' && (
          <div className="td-mi-view-toolbar td-mi-view-toolbar--back">
            <button type="button" className="td-mi-decoder-back" onClick={() => setInternalDecoder(false)}>
              ← Dashboard
            </button>
          </div>
        )}
        <MarketDecoderView embedded />
      </div>
    );
  }

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
    riskEngine,
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
          {['currentRegime', 'bias', 'primaryDriver', 'secondaryDriver', 'marketSentiment', 'tradeEnvironment'].map((key) => (
            <div key={key} className="td-mi-regime-row">
              <label className="td-mi-regime-label">
                {key === 'currentRegime' && 'Regime'}
                {key === 'bias' && 'Bias'}
                {key === 'primaryDriver' && 'Primary Driver'}
                {key === 'secondaryDriver' && 'Secondary Driver'}
                {key === 'marketSentiment' && 'Global Sentiment'}
                {key === 'tradeEnvironment' && 'Trade Environment'}
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
    return <MarketPulseGauge score={marketPulse.score} label={marketPulse.label} recommendedAction={marketPulse.recommendedAction} />;
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

  const impactOptions = ['high', 'medium', 'low'];
  const directionOptions = ['up', 'down', 'neutral'];

  const renderDriversEdit = () => (
    <div className="td-mi-edit td-mi-edit--drivers">
      <p className="td-mi-source">Live market data. Edit to override.</p>
      <ul className="td-mi-list td-mi-list--drivers">
        {(editDraft.keyDrivers || []).map((d, i) => (
          <li key={i} className="td-mi-list-item td-mi-list-item--edit">
            <input
              type="text"
              className="td-mi-edit-input td-mi-edit-driver-name"
              value={d.name || ''}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], name: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }}
              placeholder="Driver name"
            />
            <select
              className="td-mi-edit-select"
              value={d.impact || 'medium'}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], impact: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }}
              aria-label="Impact"
            >
              {impactOptions.map((opt) => (
                <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)} Impact</option>
              ))}
            </select>
            <select
              className="td-mi-edit-select td-mi-edit-select--dir"
              value={d.direction || 'neutral'}
              onChange={(e) => {
                const next = [...(editDraft.keyDrivers || [])];
                next[i] = { ...next[i], direction: e.target.value };
                setEditDraft((x) => ({ ...x, keyDrivers: next }));
              }}
              aria-label="Direction"
            >
              {directionOptions.map((opt) => (
                <option key={opt} value={opt}>{opt === 'neutral' ? 'Neutral' : opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
              ))}
            </select>
            <button
              type="button"
              className="td-mi-btn td-mi-btn-remove"
              onClick={() => setEditDraft((x) => ({ ...x, keyDrivers: (x.keyDrivers || []).filter((_, j) => j !== i) }))}
              aria-label="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="td-mi-btn td-mi-btn-small"
        onClick={() => setEditDraft((d) => ({ ...d, keyDrivers: [...(d.keyDrivers || []), { name: '', impact: 'medium', direction: 'neutral' }] }))}
      >
        + Add driver
      </button>
    </div>
  );

  const renderSignalsEdit = () => (
    <div className="td-mi-edit td-mi-edit--signals">
      <p className="td-mi-source">Live market data. Edit to override.</p>
      <ul className="td-mi-list td-mi-list--signals">
        {(editDraft.crossAssetSignals || []).map((s, i) => (
          <li key={i} className="td-mi-list-item td-mi-list-item--edit">
            <input
              type="text"
              className="td-mi-edit-input td-mi-edit-signal-asset"
              value={s.asset || ''}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], asset: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }}
              placeholder="Asset"
            />
            <input
              type="text"
              className="td-mi-edit-input td-mi-edit-signal-value"
              value={s.signal || ''}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], signal: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }}
              placeholder="Signal"
            />
            <select
              className="td-mi-edit-select td-mi-edit-select--dir"
              value={s.direction || 'neutral'}
              onChange={(e) => {
                const next = [...(editDraft.crossAssetSignals || [])];
                next[i] = { ...next[i], direction: e.target.value };
                setEditDraft((x) => ({ ...x, crossAssetSignals: next }));
              }}
              aria-label="Direction"
            >
              {directionOptions.map((opt) => (
                <option key={opt} value={opt}>{opt === 'neutral' ? 'Neutral' : opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
              ))}
            </select>
            <button
              type="button"
              className="td-mi-btn td-mi-btn-remove"
              onClick={() => setEditDraft((x) => ({ ...x, crossAssetSignals: (x.crossAssetSignals || []).filter((_, j) => j !== i) }))}
              aria-label="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="td-mi-btn td-mi-btn-small"
        onClick={() => setEditDraft((d) => ({ ...d, crossAssetSignals: [...(d.crossAssetSignals || []), { asset: '', signal: '—', direction: 'neutral' }] }))}
      >
        + Add signal
      </button>
    </div>
  );

  const content = (
    <>
      <div className="td-mi-view-toolbar">
        <button type="button" className="td-mi-decoder-pill" onClick={() => setInternalDecoder(true)}>
          Market Decoder
        </button>
      </div>
      {error && (
        <p className="td-mi-fallback-msg" role="status">
          {error}
        </p>
      )}
      <TraderDeckDashboardShell
        title="Trader Desk"
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
          {editMode && editDraft ? renderDriversEdit() : (
            <>
              <DriverList drivers={keyDrivers} />
            </>
          )}
        </DashboardPanel>
        <DashboardPanel title="Cross-Asset Signals" className="td-mi-panel--signals">
          {editMode && editDraft ? renderSignalsEdit() : (
            <>
              <SignalList signals={crossAssetSignals} />
            </>
          )}
        </DashboardPanel>
        <DashboardPanel title="Market Change Today" className="td-mi-panel--changes">
          {editMode && editDraft ? renderListEdit(editDraft.marketChangesToday, 'marketChangesToday', 'Theme') : <ChangeList items={marketChangesToday} />}
        </DashboardPanel>

        <DashboardPanel title="Trader Focus" wide className="td-mi-panel--focus">
          {editMode && editDraft ? renderListEdit(editDraft.traderFocus, 'traderFocus', 'Focus item') : <FocusList items={traderFocus} />}
        </DashboardPanel>
        <DashboardPanel title="Market Risk Engine" wide className="td-mi-panel--radar">
          {editMode && editDraft ? (
            <>
              <p className="td-mi-source">Event-risk engine. List refreshes from live calendar and macro flow.</p>
              {renderListEdit(editDraft.riskRadar, 'riskRadar', 'News event')}
            </>
          ) : (
            <>
              <p className="td-mi-source td-mi-source--readonly">Cross-market risk engine with event, volatility, liquidity and clustering context.</p>
              <RiskRadarList items={riskRadar} riskEngine={riskEngine} />
            </>
          )}
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
