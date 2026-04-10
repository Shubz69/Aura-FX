/**
 * Market Outlook content for Trader Deck – date-scoped Daily or Weekly.
 * Same panels as the main dashboard; data from API for selected date or live/seed fallback.
 */
import React, { useState, useEffect, useRef } from 'react';
import Api from '../../services/Api';
import { getMarketIntelligence, SEED_MARKET_INTELLIGENCE } from '../../data/marketIntelligence';
import RegimeRows from '../../components/trader-deck/RegimeRows';
import MarketPulseGauge from '../../components/trader-deck/MarketPulseGauge';
import DriverList from '../../components/trader-deck/DriverList';
import SignalList from '../../components/trader-deck/SignalList';
import ChangeList from '../../components/trader-deck/ChangeList';
import FocusList from '../../components/trader-deck/FocusList';
import RiskRadarList from '../../components/trader-deck/RiskRadarList';
import SessionContextPanel from '../../components/trader-deck/SessionContextPanel';
import { getTraderDeckIntelStorageYmd } from '../../lib/trader-deck/deskDates';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

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
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null ? (pulse.score ?? pulse.value) : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
      recommendedAction: Array.isArray(pulse?.recommendedAction) ? pulse.recommendedAction : [],
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    traderFocus: (data.traderFocus || []).map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') {
        return { title: x.title || x.text || '', reason: x.reason || '' };
      }
      return x;
    }),
    riskRadar: data.riskRadar || [],
    riskEngine: data.riskEngine || null,
    riskRadarDate: data.riskRadarDate || null,
    updatedAt: data.updatedAt,
    aiSessionBrief: data.aiSessionBrief || '',
    aiTradingPriorities: Array.isArray(data.aiTradingPriorities) ? data.aiTradingPriorities : [],
    headlineSample: Array.isArray(data.headlineSample) ? data.headlineSample.map((h) => String(h || '').trim()).filter(Boolean) : [],
    sessionContext: data.sessionContext && typeof data.sessionContext === 'object' ? data.sessionContext : null,
  };
}

const impactOptions = ['high', 'medium', 'low'];
const directionOptions = ['up', 'down', 'neutral'];

const LIVE_REFRESH_MS = 75 * 1000;

function hasDetailedRiskRadarRows(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((row) => {
    if (!row || typeof row !== 'object') return false;
    return Boolean(row.time || row.date || row.datetime || row.currency || row.impact || row.forecast || row.previous);
  });
}

function mergeManualOverrides(botPayload, manualOverrides, overrideKeys = []) {
  const base = botPayload && typeof botPayload === 'object' ? { ...botPayload } : {};
  const overrides = manualOverrides && typeof manualOverrides === 'object' ? manualOverrides : {};
  const keys = Array.isArray(overrideKeys) && overrideKeys.length > 0
    ? overrideKeys
    : Object.keys(overrides);
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      base[key] = overrides[key];
    }
  });
  return base;
}

export default function MarketOutlookView({ selectedDate, period, canEdit }) {
  const type = period === 'weekly' ? 'outlook-weekly' : 'outlook-daily';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  /** 'saved' = admin JSON in DB; 'live' = pulled from live feeds */
  const dataSourceRef = useRef('loading');
  const liveRefreshInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveSuccess(null);
    dataSourceRef.current = 'loading';
    const dateStr = getTraderDeckIntelStorageYmd(selectedDate, period);
    Api.getTraderDeckContent(type, dateStr)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.payload;
        if (payload && typeof payload === 'object') {
          dataSourceRef.current = 'saved';
          const hasOverrideEnvelope = payload.manualOverrides && payload.botPayload;
          const loadSaved = (liveRaw) => {
            const livePayload = liveRaw && typeof liveRaw === 'object' ? liveRaw : null;
            const effective = hasOverrideEnvelope
              ? mergeManualOverrides(livePayload || payload.botPayload || {}, payload.manualOverrides, payload.manualOverrideKeys || [])
              : payload;
            const normalizedSaved = normalizeForUI(effective);
            setData(normalizedSaved);
            if (!hasDetailedRiskRadarRows(normalizedSaved?.riskRadar) && !hasOverrideEnvelope) {
              getMarketIntelligence({ refresh: true, timeframe: period, date: dateStr })
                .then((rawLive) => {
                  if (cancelled) return;
                  const normalizedLive = normalizeForUI(rawLive);
                  if (!normalizedLive?.riskRadar || normalizedLive.riskRadar.length === 0) return;
                  setData((prev) => {
                    if (!prev) return normalizedLive;
                    return { ...prev, riskRadar: normalizedLive.riskRadar };
                  });
                })
                .catch(() => {});
            }
          };
          if (hasOverrideEnvelope) {
            getMarketIntelligence({ refresh: false, timeframe: period, date: dateStr })
              .then((rawLive) => {
                if (cancelled) return;
                loadSaved(rawLive);
              })
              .catch(() => {
                if (!cancelled) loadSaved(null);
              });
          } else {
            loadSaved(null);
          }
          return;
        }
        dataSourceRef.current = 'live';
        return getMarketIntelligence({ refresh: false, timeframe: period, date: dateStr }).then((raw) => {
          if (cancelled) return;
          const normalized = normalizeForUI(raw) || normalizeForUI(SEED_MARKET_INTELLIGENCE);
          setData(normalized);
        });
      })
      .catch(() => {
        if (cancelled) return;
        dataSourceRef.current = 'live';
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE);
        setData(normalized);
        setError('Using fallback data');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, [type, selectedDate, period]);

  // Refresh live outlook + AI brief on an interval (not when displaying saved admin content)
  useEffect(() => {
    if (editMode) return undefined;
    const iv = setInterval(() => {
      if (dataSourceRef.current !== 'live') return;
      if (liveRefreshInFlightRef.current) return;
      liveRefreshInFlightRef.current = true;
      const dateStr = getTraderDeckIntelStorageYmd(selectedDate, period);
      getMarketIntelligence({ refresh: true, timeframe: period, date: dateStr })
        .then((raw) => {
          const normalized = normalizeForUI(raw);
          if (normalized) setData(normalized);
        })
        .catch(() => {})
        .finally(() => {
          liveRefreshInFlightRef.current = false;
        });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(iv);
  }, [editMode, type, selectedDate, period]);

  const handleEditToggle = () => {
    if (editMode) {
      setEditMode(false);
      setEditDraft(null);
      return;
    }
    const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE);
    const toStr = (x) => (typeof x === 'string' ? x : (x && (x.title || x.text || x.description)) || '');
    const toRiskRow = (x) => {
      if (typeof x === 'string') return { title: x };
      if (x && typeof x === 'object') return { ...x };
      return { title: '' };
    };
    setEditDraft({
      marketRegime: { ...ui.marketRegime },
      marketPulse: { score: ui.marketPulse.score, label: ui.marketPulse.label },
      keyDrivers: (ui.keyDrivers || []).map((d) => ({ ...d, name: d.name || d.title })),
      crossAssetSignals: (ui.crossAssetSignals || []).map((s) => ({ ...s })),
      marketChangesToday: (ui.marketChangesToday || []).map(toStr),
      traderFocus: (ui.traderFocus || []).map(toStr),
      riskRadar: (ui.riskRadar || []).map(toRiskRow),
    });
    setEditMode(true);
  };

  const handleSave = () => {
    if (!editDraft) return;
    const dateStr = getTraderDeckIntelStorageYmd(selectedDate, period);
    const manualOverrides = {
      marketRegime: editDraft.marketRegime,
      marketPulse: { score: editDraft.marketPulse.score, label: editDraft.marketPulse.label },
      keyDrivers: editDraft.keyDrivers,
      crossAssetSignals: editDraft.crossAssetSignals,
      marketChangesToday: editDraft.marketChangesToday,
      traderFocus: editDraft.traderFocus,
      riskRadar: editDraft.riskRadar,
    };
    const manualOverrideKeys = Object.keys(manualOverrides);
    const payload = {
      botPayload: data || {},
      manualOverrides,
      manualOverrideKeys,
      riskRadarDate: dateStr,
      updatedAt: new Date().toISOString(),
    };
    setError(null);
    setSaveSuccess(null);
    Api.putTraderDeckContent(type, dateStr, payload)
      .then(() => {
        setData(normalizeForUI(mergeManualOverrides(data || {}, manualOverrides, manualOverrideKeys)));
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
    riskEngine,
  } = showing;

  const sessionContextLive = (data && data.sessionContext) || ui.sessionContext || null;
  const headlineFeed = (data && data.headlineSample) || ui.headlineSample || [];

  const renderRegime = () => {
    if (editMode && editDraft) {
      const r = editDraft.marketRegime || {};
      return (
        <div className="td-mi-regime-rows td-mi-edit">
          {['currentRegime', 'bias', 'primaryDriver', 'secondaryDriver', 'marketSentiment', 'tradeEnvironment', 'biasStrength', 'convictionClarity'].map((key) => (
            <div key={key} className="td-mi-regime-row">
              <label className="td-mi-regime-label">
                {key === 'currentRegime' && 'Regime'}
                {key === 'bias' && 'Bias'}
                {key === 'primaryDriver' && 'Primary Driver'}
                {key === 'secondaryDriver' && 'Secondary Driver'}
                {key === 'marketSentiment' && 'Global Sentiment'}
                {key === 'tradeEnvironment' && 'Trade Environment'}
                {key === 'biasStrength' && 'Bias strength'}
                {key === 'convictionClarity' && 'Conviction / clarity'}
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

  const pulseRegimeDescriptor = (() => {
    const r = showing.marketRegime;
    if (!r || typeof r !== 'object') return '';
    const a = String(r.currentRegime || '').trim();
    const b = String(r.bias || '').trim();
    if (a && b) return `${a} · ${b}`;
    return a || b || '';
  })();

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
    return (
      <MarketPulseGauge
        score={marketPulse.score}
        label={marketPulse.label}
        recommendedAction={marketPulse.recommendedAction}
        variant="outlook"
        regimeDescriptor={pulseRegimeDescriptor}
      />
    );
  };

  const renderListEdit = (list, key, placeholder, options = {}) => (
    <ul className="td-mi-bullets">
      {(list || []).map((item, i) => (
        <li key={i} className="td-mi-bullet-item">
          <input type="text" className="td-mi-edit-input td-mi-edit-inline"
            value={typeof item === 'string' ? item : (item.title || item.text || '')}
            onChange={(e) => {
              const next = [...(editDraft[key] || [])];
              if (options.preserveObject && item && typeof item === 'object') {
                next[i] = { ...item, title: e.target.value };
              } else if (options.preserveObject) {
                next[i] = { title: e.target.value };
              } else {
                next[i] = e.target.value;
              }
              setEditDraft((d) => ({ ...d, [key]: next }));
            }}
            placeholder={placeholder} />
        </li>
      ))}
      <li>
        <button type="button" className="td-mi-btn td-mi-btn-small"
          onClick={() => setEditDraft((d) => ({ ...d, [key]: [...(d[key] || []), options.preserveObject ? { title: '' } : ''] }))}>+ Add</button>
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
  const changesTitle = period === 'weekly' ? 'Market Change This Week' : 'Market Change Today';

  return (
    <>
      {error && <p className="td-mi-fallback-msg" role="status">{error}</p>}
      {saveSuccess && <p className="td-mi-save-success" role="status">{saveSuccess}</p>}
      <div className="td-deck-mo-root td-deck-mo-outlook td-deck-mo-outlook--concept">
          <header className="td-outlook-unified-header td-deck-mo-outlook-hero td-outlook-concept-page-header">
            <div className="td-deck-mo-outlook-hero-text">
              <p className="td-deck-mo-eyebrow">Aura Terminal</p>
              <h1 className="td-outlook-main-title td-outlook-concept-page-title">{mainTitle}</h1>
            </div>
            {canEdit && editMode ? (
              <div className="td-mi-shell-actions td-deck-mo-outlook-actions">
                <button type="button" className="td-mi-btn td-mi-btn-save" onClick={handleSave}>Save</button>
                <button type="button" className="td-mi-btn td-mi-btn-cancel" onClick={handleCancel}>Cancel</button>
              </div>
            ) : null}
          </header>
          <div className="td-outlook-dashboard td-outlook-dashboard--unified td-deck-mo-outlook-dash">
            <div className="td-outlook-terminal-frame td-outlook-concept-shell">
              <div className="td-outlook-terminal-inner">
                <div className="td-outlook-concept-grid">
                  <section
                    className="td-outlook-concept-card td-outlook-concept-card--regime mo-card-shell"
                    aria-label="Aura market regime"
                  >
                    <h2 className="td-outlook-concept-card__title">Aura Market Regime</h2>
                    <div className="td-outlook-concept-card__body">{renderRegime()}</div>
                  </section>

                  <div className="td-outlook-concept-intel mo-grid-gap-sm" aria-label="Session context, drivers, and cross-asset signals">
                    <div className="td-outlook-concept-intel-col td-outlook-concept-intel-col--left">
                      <section className="td-outlook-concept-card td-outlook-concept-card--session mo-card-shell" aria-label="Session context">
                        <h2 className="td-outlook-concept-card__title mo-section-header">Session Context</h2>
                        <div className="td-outlook-concept-card__body td-outlook-concept-card__body--session">
                          {sessionContextLive ? (
                            <SessionContextPanel sessionContext={sessionContextLive} />
                          ) : (
                            <p className="td-outlook-empty mo-terminal-feed__empty">Session context loads with live intelligence.</p>
                          )}
                        </div>
                      </section>
                      <section className="td-outlook-concept-card td-outlook-concept-card--drivers mo-card-shell">
                        <h2 className="td-outlook-concept-card__title">Key Market Drivers</h2>
                        <div className="td-outlook-concept-card__body">
                          {editMode && editDraft ? renderDriversEdit() : <DriverList drivers={keyDrivers} />}
                        </div>
                      </section>
                    </div>
                    <div className="td-outlook-concept-intel-col td-outlook-concept-intel-col--right">
                      <section className="td-outlook-concept-card td-outlook-concept-card--signals mo-card-shell">
                        <h2 className="td-outlook-concept-card__title">Cross-Asset Signals</h2>
                        <div className="td-outlook-concept-card__body">
                          {editMode && editDraft ? renderSignalsEdit() : <SignalList signals={crossAssetSignals} />}
                        </div>
                      </section>
                    </div>
                  </div>

                  <section className="td-outlook-concept-card td-outlook-concept-card--changes mo-card-shell" aria-label={changesTitle}>
                    <h2 className="td-outlook-concept-card__title">{changesTitle}</h2>
                    <div className="td-outlook-concept-card__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.marketChangesToday, 'marketChangesToday', 'Theme')
                      ) : marketChangesToday && marketChangesToday.length > 0 ? (
                        <ChangeList items={marketChangesToday} />
                      ) : (
                        <p className="td-outlook-empty">No themes recorded. Use Edit to add.</p>
                      )}
                    </div>
                  </section>

                  <section
                    className="td-outlook-concept-card td-outlook-concept-card--pulse td-outlook-concept-pulse mo-card-shell mo-card-shell--focal"
                    aria-label="Aura market pulse"
                  >
                    <header className="td-outlook-concept-card__head">
                      <h2 className="td-outlook-concept-card__title">Aura Market Pulse</h2>
                      {canEdit && !editMode ? (
                        <button
                          type="button"
                          className="td-mi-btn td-mi-btn-edit td-outlook-concept-pulse-edit"
                          onClick={handleEditToggle}
                          aria-label="Edit content"
                        >
                          Edit
                        </button>
                      ) : null}
                    </header>
                    <div className="td-outlook-concept-card__body td-outlook-concept-pulse__body">
                      {renderPulse()}
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--focus mo-card-shell" aria-label="Trader focus">
                    <h2 className="td-outlook-concept-card__title">Trader Focus</h2>
                    <div className="td-outlook-concept-card__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.traderFocus, 'traderFocus', 'Focus item')
                      ) : traderFocus && traderFocus.length > 0 ? (
                        <FocusList items={traderFocus} />
                      ) : (
                        <p className="td-outlook-empty">No focus items. Use Edit to add.</p>
                      )}
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--risk mo-card-shell" aria-label="Market risk engine">
                    <h2 className="td-outlook-concept-card__title">Market Risk Engine</h2>
                    <div className="td-outlook-concept-card__body td-outlook-concept-risk__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.riskRadar, 'riskRadar', 'Risk factor', { preserveObject: true })
                      ) : (riskRadar && riskRadar.length > 0) || riskEngine ? (
                        <RiskRadarList items={riskRadar || []} riskEngine={riskEngine} summaryOnly={period === 'daily'} />
                      ) : (
                        <p className="td-outlook-empty">No upcoming events. Use Edit to add.</p>
                      )}
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--headlines mo-card-shell" aria-label="Market headlines">
                    <header className="td-outlook-concept-card__head td-outlook-concept-card__head--headlines">
                      <h2 className="td-outlook-concept-card__title">Market Headlines</h2>
                      <span className="mo-meta" title={ui.updatedAt || ''}>
                        {formatRelativeFreshness(ui.updatedAt)}
                      </span>
                    </header>
                    <div className="td-outlook-concept-card__body td-outlook-concept-card__body--headlines">
                      {headlineFeed.length > 0 ? (
                        <ul className="mo-terminal-feed">
                          {headlineFeed.slice(0, 5).map((line, i) => (
                            <li key={i} className="mo-terminal-feed__row">
                              <span className="mo-terminal-feed__text">{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="td-outlook-empty mo-terminal-feed__empty">No headline snapshot yet. Refresh intelligence.</p>
                      )}
                      <p className="mo-terminal-feed__note">Event detail in the Economic Calendar below.</p>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
      </div>
    </>
  );
}
