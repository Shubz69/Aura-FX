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
import TraderDeskDataQualityBanner from '../../components/trader-deck/TraderDeskDataQualityBanner';
import { stripModelInternalExposition, sanitizeAiTradingPriorities } from '../../utils/sanitizeAiDeskOutput';

function buildTimelineFallback(marketChangesToday, tf) {
  const label = tf === 'weekly' ? 'Week' : 'Session';
  const list = Array.isArray(marketChangesToday) ? marketChangesToday : [];
  return list.map((item, idx) => {
    const text = typeof item === 'string' ? item : (item?.title || item?.description || '');
    const assets = [];
    const tl = String(text || '').toLowerCase();
    if (/yield|bond|rate/.test(tl)) assets.push('Yields');
    if (/usd|dollar|fx/.test(tl)) assets.push('FX');
    if (/gold|xau/.test(tl)) assets.push('Gold');
    if (/equit|stock|risk/.test(tl)) assets.push('Equities');
    if (assets.length === 0) assets.push('Cross-asset');
    return {
      timeLabel: `${label} ${idx + 1}`,
      whatChanged: text,
      assetsAffected: assets,
      whyItMatters: 'Highlights what changed versus the prior desk baseline; follow-through depends on liquidity and calendar.',
      priority: typeof item === 'object' && item?.priority ? item.priority : 'medium',
    };
  });
}

function normalizeForUI(data, period = 'daily') {
  if (!data) return null;
  const tf = period === 'weekly' || data.deskTimeframe === 'weekly' || data.timeframe === 'weekly' ? 'weekly' : 'daily';
  const regime = data.marketRegime;
  const pulse = data.marketPulse;
  const drivers = (data.keyDrivers || []).map((d) => ({
    name: d.name || d.title || '',
    direction: (d.direction || 'neutral').toLowerCase(),
    impact: typeof d.impact === 'string' ? d.impact.toLowerCase() : (d.impact || 'medium'),
    effect: d.effect || '',
    explanation: typeof d.explanation === 'string' ? d.explanation : '',
    affectedAssets: Array.isArray(d.affectedAssets) ? d.affectedAssets : [],
  }));
  const signals = (data.crossAssetSignals || []).map((s) => ({
    asset: s.asset || '',
    signal: s.signal || s.label || '—',
    direction: (s.direction || 'neutral').toLowerCase(),
    strength: typeof s.strength === 'string' ? s.strength : '',
    implication: typeof s.implication === 'string' ? s.implication : '',
  }));
  const timeline = (data.marketChangesTimeline && data.marketChangesTimeline.length)
    ? data.marketChangesTimeline
    : buildTimelineFallback(data.marketChangesToday || [], tf);
  const headlineSample = Array.isArray(data.headlineSample) ? data.headlineSample.map((h) => String(h || '').trim()).filter(Boolean) : [];
  const headlineInsights = (data.headlineInsights && data.headlineInsights.length)
    ? data.headlineInsights
    : headlineSample.map((text) => ({
      text,
      sentiment: 'neutral',
      impact: 'low',
      affectedAssets: [],
    }));
  const marketImplications = (data.marketImplications && data.marketImplications.length)
    ? data.marketImplications
    : [
      {
        condition: 'Desk intelligence is still connecting',
        then: 'Cross-asset labels stay coarse until live feeds respond',
        implication: 'Scenario detail fills in automatically once the service returns a full outlook object',
      },
    ];
  const instrumentSnapshots = (data.instrumentSnapshots && data.instrumentSnapshots.length)
    ? data.instrumentSnapshots
    : [
      {
        symbol: 'Snapshots',
        bias: 'Neutral',
        structure: 'Awaiting live cross-asset',
        keyLevel: '—',
        note: 'Instrument cards populate from the desk intelligence bundle when available.',
      },
    ];
  const outlookDataStatus = data.outlookDataStatus && typeof data.outlookDataStatus === 'object'
    ? data.outlookDataStatus
    : {
      lastUpdated: data.updatedAt || null,
      freshnessLabel: formatRelativeFreshness(data.updatedAt) || 'Desk status pending',
      sourceTier: 'fallback',
      degraded: true,
    };
  return {
    marketRegime: regime,
    marketPulse: {
      score: pulse && (typeof pulse.score === 'number' ? pulse.score : pulse.value) != null ? (pulse.score ?? pulse.value) : 50,
      label: (pulse && pulse.label) || 'NEUTRAL',
      recommendedAction: Array.isArray(pulse?.recommendedAction) ? pulse.recommendedAction : [],
      outlookPulse: pulse?.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null,
    },
    keyDrivers: drivers,
    crossAssetSignals: signals,
    marketChangesToday: data.marketChangesToday || [],
    marketChangesTimeline: timeline,
    marketImplications,
    instrumentSnapshots,
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
    aiSessionBrief: stripModelInternalExposition(data.aiSessionBrief || ''),
    aiTradingPriorities: sanitizeAiTradingPriorities(
      Array.isArray(data.aiTradingPriorities) ? data.aiTradingPriorities : []
    ),
    headlineSample,
    headlineInsights,
    sessionContext: data.sessionContext && typeof data.sessionContext === 'object' ? data.sessionContext : null,
    outlookRiskContext: data.outlookRiskContext && typeof data.outlookRiskContext === 'object' ? data.outlookRiskContext : null,
    outlookDataStatus,
    marketOutlookVersion: data.marketOutlookVersion != null ? data.marketOutlookVersion : null,
    dataQuality: data.dataQuality || 'live',
    degradedReason: data.degradedReason ?? null,
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
  /** React state mirror for banners: saved outlook row vs live GET intelligence */
  const [contentSource, setContentSource] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveSuccess(null);
    dataSourceRef.current = 'loading';
    setContentSource('loading');
    const dateStr = getTraderDeckIntelStorageYmd(selectedDate, period);
    Api.getTraderDeckContent(type, dateStr)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.payload;
        if (payload && typeof payload === 'object') {
          dataSourceRef.current = 'saved';
          setContentSource('saved');
          const hasOverrideEnvelope = payload.manualOverrides && payload.botPayload;
          const loadSaved = (liveRaw) => {
            const livePayload = liveRaw && typeof liveRaw === 'object' ? liveRaw : null;
            const effective = hasOverrideEnvelope
              ? mergeManualOverrides(livePayload || payload.botPayload || {}, payload.manualOverrides, payload.manualOverrideKeys || [])
              : payload;
            const normalizedSaved = normalizeForUI(effective, period);
            setData(normalizedSaved);
            if (!hasDetailedRiskRadarRows(normalizedSaved?.riskRadar) && !hasOverrideEnvelope) {
              getMarketIntelligence({ refresh: true, timeframe: period, date: dateStr })
                .then((rawLive) => {
                  if (cancelled) return;
                  const normalizedLive = normalizeForUI(rawLive, period);
                  if (!normalizedLive?.riskRadar || normalizedLive.riskRadar.length === 0) return;
                  setData((prev) => {
                    if (!prev) return normalizedLive;
                    return { ...prev, riskRadar: normalizedLive.riskRadar };
                  });
                })
                .catch((e) => {
                  if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.warn('[MarketOutlookView] risk radar enrichment failed', e?.message || e);
                  }
                });
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
        setContentSource('live');
        return getMarketIntelligence({ refresh: false, timeframe: period, date: dateStr }).then((raw) => {
          if (cancelled) return;
          const normalized = normalizeForUI(raw, period) || normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
          setData(normalized);
        });
      })
      .catch(() => {
        if (cancelled) return;
        dataSourceRef.current = 'live';
        setContentSource('live');
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
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
          const normalized = normalizeForUI(raw, period);
          if (normalized) setData(normalized);
        })
        .catch((e) => {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.warn('[MarketOutlookView] live interval refresh failed', e?.message || e);
          }
        })
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
    const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
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
      dataQuality: ui.dataQuality || 'live',
      degradedReason: ui.degradedReason ?? null,
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
        setData(normalizeForUI(mergeManualOverrides(data || {}, manualOverrides, manualOverrideKeys), period));
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

  const ui = data || normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
  const showing =
    editMode && editDraft
      ? {
          ...editDraft,
          dataQuality: editDraft.dataQuality ?? ui.dataQuality ?? 'live',
          degradedReason: editDraft.degradedReason ?? ui.degradedReason ?? null,
        }
      : ui;

  const bannerDataQuality =
    contentSource === 'saved' ? 'pipeline' : (ui.dataQuality || 'live');
  const bannerDegradedReason = contentSource === 'saved' ? null : (ui.degradedReason ?? null);
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

  const outlookSnapshot = ui;
  const tfShort = period === 'weekly' ? 'weekly' : 'daily';
  const marketChangesTimeline = editMode && editDraft
    ? buildTimelineFallback(editDraft.marketChangesToday || [], tfShort)
    : (showing.marketChangesTimeline || []);
  const marketImplications = outlookSnapshot.marketImplications || [];
  const instrumentSnapshots = outlookSnapshot.instrumentSnapshots || [];
  const headlineInsights = outlookSnapshot.headlineInsights || [];
  const outlookRiskContext = outlookSnapshot.outlookRiskContext;
  const outlookDataStatus = outlookSnapshot.outlookDataStatus;
  const marketPulseForGauge = editMode && editDraft
    ? { ...editDraft.marketPulse, outlookPulse: ui.marketPulse?.outlookPulse || null }
    : showing.marketPulse;

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
        score={marketPulseForGauge.score}
        label={marketPulseForGauge.label}
        recommendedAction={marketPulseForGauge.recommendedAction}
        outlookPulse={marketPulseForGauge.outlookPulse}
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
      <TraderDeskDataQualityBanner
        dataQuality={bannerDataQuality}
        degradedReason={bannerDegradedReason}
      />
      <div className="td-deck-mo-root td-deck-mo-outlook td-deck-mo-outlook--concept">
          <header className="td-outlook-unified-header td-deck-mo-outlook-hero td-outlook-concept-page-header">
            <div className="td-deck-mo-outlook-hero-text">
              <p className="td-deck-mo-eyebrow">Aura Terminal</p>
              <h1 className="td-outlook-main-title td-outlook-concept-page-title">{mainTitle}</h1>
              {outlookDataStatus ? (
                <div className="mo-outlook-freshness" role="status" aria-live="polite">
                  <span className="mo-outlook-freshness__label">{outlookDataStatus.freshnessLabel || '—'}</span>
                  <span className={`mo-outlook-freshness__tier mo-outlook-freshness__tier--${outlookDataStatus.sourceTier || 'fallback'}`}>
                    {outlookDataStatus.sourceTier === 'paid' ? 'Paid pipeline' : outlookDataStatus.sourceTier === 'live' ? 'Live build' : 'Fallback / partial'}
                  </span>
                  {outlookDataStatus.degraded ? (
                    <span className="mo-outlook-freshness__degraded">Partial data</span>
                  ) : null}
                </div>
              ) : null}
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
                <div className="td-outlook-concept-grid td-outlook-concept-grid--terminal">
                  <div className="td-outlook-concept-col td-outlook-concept-col--primary">
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
                      <section className="td-outlook-concept-card td-outlook-concept-card--instruments mo-card-shell" aria-label="Instrument snapshots">
                        <h2 className="td-outlook-concept-card__title">Instrument Snapshots</h2>
                        <div className="td-outlook-concept-card__body">
                          <div className="mo-instrument-grid">
                            {(instrumentSnapshots || []).slice(0, 6).map((card) => (
                              <article key={card.symbol} className="mo-instrument-card">
                                <header className="mo-instrument-card__head">
                                  <span className="mo-instrument-card__sym">{card.symbol}</span>
                                  <span className="mo-pill mo-pill--soft">{card.bias || '—'}</span>
                                </header>
                                <p className="mo-instrument-card__row"><span>Structure</span><strong>{card.structure || '—'}</strong></p>
                                <p className="mo-instrument-card__row"><span>Key level</span><strong>{card.keyLevel || '—'}</strong></p>
                                <p className="mo-instrument-card__note">{card.note || ''}</p>
                              </article>
                            ))}
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>

                  <section className="td-outlook-concept-card td-outlook-concept-card--changes mo-card-shell" aria-label={changesTitle}>
                    <h2 className="td-outlook-concept-card__title">{changesTitle}</h2>
                    <div className="td-outlook-concept-card__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.marketChangesToday, 'marketChangesToday', 'Theme')
                      ) : marketChangesTimeline && marketChangesTimeline.length > 0 ? (
                        <ChangeList items={marketChangesTimeline} variant="timeline" />
                      ) : (
                        <p className="td-outlook-empty">No themes recorded. Use Edit to add.</p>
                      )}
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--implications mo-card-shell" aria-label="Market implications">
                    <h2 className="td-outlook-concept-card__title">Market Implications</h2>
                    <p className="mo-section-sub">Scenario context only — not execution guidance.</p>
                    <div className="td-outlook-concept-card__body">
                      <ul className="mo-implications-list">
                        {(marketImplications || []).map((row, i) => (
                          <li key={i} className="mo-implication-row">
                            <p><span className="mo-implication-k">If</span> {row.condition}</p>
                            <p><span className="mo-implication-k">Then</span> {row.then}</p>
                            <p><span className="mo-implication-k">Implication</span> {row.implication}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--focus mo-card-shell" aria-label="Trader focus">
                    <h2 className="td-outlook-concept-card__title">Trader Focus</h2>
                    <p className="mo-section-sub">Observational attention areas — not a task list.</p>
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
                  </div>

                  <div className="td-outlook-concept-col td-outlook-concept-col--secondary">
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

                  <section className="td-outlook-concept-card td-outlook-concept-card--risk mo-card-shell" aria-label="Market risk engine">
                    <h2 className="td-outlook-concept-card__title">Market Risk Engine</h2>
                    <div className="td-outlook-concept-card__body td-outlook-concept-risk__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.riskRadar, 'riskRadar', 'Risk factor', { preserveObject: true })
                      ) : (riskRadar && riskRadar.length > 0) || riskEngine ? (
                        <RiskRadarList
                          items={riskRadar || []}
                          riskEngine={riskEngine}
                          summaryOnly={period === 'daily'}
                          outlookContext={outlookRiskContext}
                        />
                      ) : (
                        <p className="td-outlook-empty">No upcoming events. Use Edit to add.</p>
                      )}
                    </div>
                  </section>

                  <section className="td-outlook-concept-card td-outlook-concept-card--brief mo-card-shell" aria-label="AI desk brief">
                    <h2 className="td-outlook-concept-card__title">AI Desk Brief</h2>
                    <p className="mo-section-sub">Summary and themes — macro context, not signals.</p>
                    <div className="td-outlook-concept-card__body">
                      {outlookSnapshot.aiSessionBrief ? (
                        <p className="mo-ai-brief">{outlookSnapshot.aiSessionBrief}</p>
                      ) : (
                        <p className="td-outlook-empty mo-terminal-feed__empty">Brief appears when the desk AI layer is enabled.</p>
                      )}
                      {Array.isArray(outlookSnapshot.aiTradingPriorities) && outlookSnapshot.aiTradingPriorities.length > 0 ? (
                        <>
                          <p className="mo-ai-brief__sub">Macro watch points</p>
                          <ul className="mo-ai-brief__list">
                            {outlookSnapshot.aiTradingPriorities.slice(0, 6).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
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
                      {headlineInsights && headlineInsights.length > 0 ? (
                        <ul className="mo-terminal-feed mo-terminal-feed--insights">
                          {headlineInsights.slice(0, 6).map((row, i) => (
                            <li key={i} className="mo-terminal-feed__row mo-terminal-feed__row--insight">
                              <div className="mo-headline-chips">
                                <span className={`mo-sentiment mo-sentiment--${row.sentiment || 'neutral'}`}>{row.sentiment || 'neutral'}</span>
                                <span className={`mo-pill mo-pill--impact mo-pill--impact-${row.impact || 'medium'}`}>{row.impact || 'med'} impact</span>
                                {Array.isArray(row.affectedAssets) && row.affectedAssets.length > 0 ? (
                                  <span className="mo-headline-assets">{row.affectedAssets.slice(0, 4).join(' · ')}</span>
                                ) : null}
                              </div>
                              <span className="mo-terminal-feed__text">{row.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : headlineFeed.length > 0 ? (
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
      </div>
    </>
  );
}
