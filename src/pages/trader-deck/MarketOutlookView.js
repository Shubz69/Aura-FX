/**
 * Market Outlook content for Trader Deck – date-scoped Daily or Weekly.
 * Same panels as the main dashboard; data from API for selected date or live/seed fallback.
 */
import React, { useState, useEffect, useRef, Fragment } from 'react';
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
import {
  buildDerivedRiskFallbackLines,
  buildOutlookSecondaryMicroRowsDense,
  deriveDominantFactorLine,
  deriveHeadlineFallbackLines,
  deriveInstrumentSnapshotsMerged,
  deriveNetDriverBiasLine,
  deriveTimelineMerged,
  deriveTraderFocusMerged,
  deriveWeakestLinkLine,
  regimeSessionFallbackPairs,
  signalLine,
} from '../../lib/trader-deck/marketOutlookDensity';
import { sanitizeTraderDeskPayloadDeep } from '../../utils/sanitizeAiDeskOutput.mjs';

/** When the API omits sleeves, derive compact cards from cross-asset signals + drivers (real desk fields, not placeholders). */
function deriveInstrumentSnapshotsFromDesk(signals, drivers) {
  const sigs = Array.isArray(signals) ? signals : [];
  if (!sigs.length) return [];
  return sigs.slice(0, 6).map((s) => {
    const asset = String(s.asset || '').trim() || 'Cross-asset';
    const dn = asset.toLowerCase();
    const driverMatch = drivers.find((d) => {
      const name = String(d.name || '').toLowerCase();
      return name && (dn.includes(name.slice(0, 4)) || name.includes(dn.slice(0, 4)));
    });
    const implication = String(s.implication || '').trim();
    return {
      symbol: asset.slice(0, 28),
      bias: String(s.signal || s.label || '—').slice(0, 44),
      structure: implication
        ? implication.slice(0, 140)
        : `${String(s.direction || 'neutral')} posture versus the prior session`,
      keyLevel: '—',
      note: driverMatch?.effect
        ? String(driverMatch.effect).slice(0, 170)
        : 'Cross-asset read synthesized from desk signals.',
    };
  });
}

/** Scenario rows from regime + timeline (no “still connecting” filler). */
/** Compact decision block: narrative left, actionable bullets right (real fields only). */
function buildImplicationsDecisionModel(showing) {
  if (!showing || typeof showing !== 'object') {
    return { scenario: '', keyTheme: '', bullets: [] };
  }
  const regime = showing.marketRegime || {};
  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const pulse = showing.marketPulse || {};
  const timeline = Array.isArray(showing.marketChangesTimeline) ? showing.marketChangesTimeline : [];
  const implications = Array.isArray(showing.marketImplications) ? showing.marketImplications : [];
  const priorities = Array.isArray(showing.aiTradingPriorities) ? showing.aiTradingPriorities : [];
  const riskEngine = showing.riskEngine || null;
  const outlookRisk = showing.outlookRiskContext && typeof showing.outlookRiskContext === 'object'
    ? showing.outlookRiskContext
    : null;
  const traderFocusRaw = Array.isArray(showing.traderFocus) ? showing.traderFocus : [];
  const traderFocus = deriveTraderFocusMerged(traderFocusRaw, drivers);

  const scenarioParts = [];
  const reg = String(regime.currentRegime || '').trim();
  const bias = String(regime.bias || regime.marketSentiment || '').trim();
  if (reg || bias) {
    scenarioParts.push(`${reg || 'Mixed regime'}${bias ? ` · ${bias}` : ''}`);
  }
  const tl0 = timeline[0];
  if (tl0 && (tl0.whatChanged || tl0.title)) {
    const hook = String(tl0.whatChanged || tl0.title || '').trim();
    if (hook) scenarioParts.push(hook.slice(0, 140));
  }
  if (!scenarioParts.length && implications[0]?.condition) {
    scenarioParts.push(String(implications[0].condition).trim().slice(0, 200));
  }
  const scenario = scenarioParts.slice(0, 2).join(' ').trim().slice(0, 280);

  let keyTheme = String(regime.primaryDriver || '').trim();
  if (!keyTheme && drivers[0]) {
    const d0 = drivers[0];
    keyTheme = `${d0.name || 'Lead driver'}: ${String(d0.effect || d0.explanation || '').trim()}`.trim();
  }
  if (!keyTheme && signals[0]) {
    keyTheme = `${signals[0].asset || 'Cross-asset'} · ${String(signals[0].signal || signals[0].implication || '').trim()}`.trim();
  }
  keyTheme = keyTheme.slice(0, 240);

  const pool = [];
  const pushPool = (raw) => {
    const t = String(raw || '').trim().replace(/\s+/g, ' ');
    if (t.length > 8) pool.push(t.slice(0, 132));
  };

  priorities.slice(0, 3).forEach(pushPool);

  drivers
    .slice()
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return (rank[String(a.impact || '').toLowerCase()] ?? 3) - (rank[String(b.impact || '').toLowerCase()] ?? 3);
    })
    .slice(0, 6)
    .forEach((d) => {
      pushPool(`${String(d.name || '').trim()} (${String(d.impact || 'med')}): ${String(d.effect || d.explanation || '').trim()}`.trim());
    });

  const rec = Array.isArray(pulse.recommendedAction) ? pulse.recommendedAction : [];
  rec.slice(0, 2).forEach((r) => pushPool(typeof r === 'string' ? r : r?.text || r?.title || ''));

  if (riskEngine?.level != null || riskEngine?.score != null) {
    pushPool(`Risk desk: ${riskEngine.level || 'posture'} · score ${riskEngine.score ?? '—'}/100`);
  }
  if (outlookRisk?.volatilityState) pushPool(`Vol regime: ${outlookRisk.volatilityState}`);
  if (outlookRisk?.clusteringBehavior) pushPool(`Linkage: ${outlookRisk.clusteringBehavior}`);
  if (outlookRisk?.nextRiskWindow) pushPool(`Next window: ${String(outlookRisk.nextRiskWindow).slice(0, 120)}`);

  implications.slice(0, 2).forEach((row) => {
    if (row?.then) pushPool(`Tape: ${String(row.then).slice(0, 120)}`);
    if (row?.implication) pushPool(`Desk lean: ${String(row.implication).slice(0, 120)}`);
  });

  traderFocus.slice(0, 6).forEach((f) => {
    const title = typeof f === 'string' ? f : f?.title || '';
    const reason = typeof f === 'object' && f?.reason ? String(f.reason).trim() : '';
    if (title) pushPool(reason ? `Watch · ${title}: ${reason.slice(0, 72)}` : `Watch · ${title}`);
  });

  signals.slice(0, 10).forEach((s) => {
    const imp = String(s.implication || '').trim();
    if (imp) pushPool(`${s.asset || 'Market'}: ${imp.slice(0, 96)}`);
  });

  const uniq = [];
  const seen = new Set();
  pool.forEach((b) => {
    const k = b.slice(0, 52);
    if (seen.has(k)) return;
    seen.add(k);
    uniq.push(b);
  });

  let bullets = uniq.slice(0, 5);
  const seenBullet = new Set(bullets.map((b) => b.slice(0, 52)));
  const takeBullet = (raw) => {
    const t = String(raw || '').trim().replace(/\s+/g, ' ');
    if (t.length < 8) return;
    const k = t.slice(0, 52);
    if (seenBullet.has(k)) return;
    if (bullets.length >= 5) return;
    seenBullet.add(k);
    bullets.push(t.slice(0, 132));
  };
  if (bullets.length < 5) {
    [deriveNetDriverBiasLine(drivers), deriveDominantFactorLine(drivers), deriveWeakestLinkLine(signals)].forEach(takeBullet);
  }
  if (bullets.length < 5) {
    drivers.slice(3, 14).forEach((d) => {
      takeBullet(`${String(d.name || '').trim()}: ${String(d.effect || d.explanation || '').trim()}`.trim());
    });
  }
  if (bullets.length < 5) {
    signals.slice(6, 18).forEach((s) => {
      const imp = String(s.implication || '').trim();
      if (imp) takeBullet(`${s.asset || 'Market'}: ${imp.slice(0, 96)}`);
    });
  }

  let scenarioOut = scenario;
  if (!String(scenarioOut || '').trim()) {
    const fp = regimeSessionFallbackPairs(regime);
    if (fp.length) scenarioOut = fp.slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ');
  }
  scenarioOut = String(scenarioOut || '').trim().slice(0, 280);

  let keyThemeOut = keyTheme;
  if (!String(keyThemeOut || '').trim()) {
    const dom = deriveDominantFactorLine(drivers);
    if (dom) keyThemeOut = dom.slice(0, 240);
  }

  return {
    scenario: scenarioOut,
    keyTheme: String(keyThemeOut || '').trim().slice(0, 240),
    bullets,
  };
}

function deriveMarketImplicationsFromDesk(regime, drivers, timeline) {
  const rows = [];
  const rReg = regime?.currentRegime || '';
  const rBias = regime?.bias || regime?.marketSentiment || '';
  if (rReg || rBias) {
    rows.push({
      condition: `Market regime: ${rReg || 'Mixed'}${rBias ? ` · sentiment ${String(rBias).trim()}` : ''}`,
      then: drivers[0]?.effect
        ? String(drivers[0].effect).slice(0, 200)
        : 'Leadership, breadth, and liquidity windows decide whether the narrative holds.',
      implication: drivers[1]
        ? `Secondary driver: ${drivers[1].name || drivers[1].title} (${drivers[1].impact || 'medium'} impact).`
        : 'Correlations often tighten when macro headlines align across regions.',
    });
  }
  const t0 = Array.isArray(timeline) ? timeline[0] : null;
  const tape = t0 && (t0.whatChanged || t0.title);
  if (tape) {
    const hook = String(tape).trim();
    rows.push({
      condition: `Tape theme: ${hook.slice(0, 140)}${hook.length > 140 ? '…' : ''}`,
      then: String(t0.whyItMatters || 'Calendar spacing and overlap sessions shape follow-through.'),
      implication:
        Array.isArray(t0.assetsAffected) && t0.assetsAffected.length > 0
          ? `Watch sleeves: ${t0.assetsAffected.slice(0, 6).join(', ')}.`
          : 'Confirm with breadth and volatility regime.',
    });
  }
  return rows.slice(0, 3);
}

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
  const marketImplications =
    data.marketImplications && data.marketImplications.length
      ? data.marketImplications
      : deriveMarketImplicationsFromDesk(regime, drivers, timeline);
  const instrumentSnapshots =
    data.instrumentSnapshots && data.instrumentSnapshots.length
      ? data.instrumentSnapshots
      : deriveInstrumentSnapshotsFromDesk(signals, drivers);
  const outlookDataStatus = data.outlookDataStatus && typeof data.outlookDataStatus === 'object'
    ? data.outlookDataStatus
    : {
      lastUpdated: data.updatedAt || null,
      freshnessLabel: formatRelativeFreshness(data.updatedAt) || 'Desk status pending',
      sourceTier: 'fallback',
      degraded: true,
    };
  return sanitizeTraderDeskPayloadDeep({
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
    aiSessionBrief: typeof data.aiSessionBrief === 'string' ? data.aiSessionBrief.trim() : '',
    aiTradingPriorities: Array.isArray(data.aiTradingPriorities) ? data.aiTradingPriorities : [],
    headlineSample,
    headlineInsights,
    sessionContext: data.sessionContext && typeof data.sessionContext === 'object' ? data.sessionContext : null,
    outlookRiskContext: data.outlookRiskContext && typeof data.outlookRiskContext === 'object' ? data.outlookRiskContext : null,
    outlookDataStatus,
    marketOutlookVersion: data.marketOutlookVersion != null ? data.marketOutlookVersion : null,
    dataQuality: data.dataQuality || 'live',
    degradedReason: data.degradedReason ?? null,
  });
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
        return getMarketIntelligence({ refresh: false, timeframe: period, date: dateStr }).then((raw) => {
          if (cancelled) return;
          const normalized = normalizeForUI(raw, period) || normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
          setData(normalized);
        });
      })
      .catch(() => {
        if (cancelled) return;
        dataSourceRef.current = 'live';
        const normalized = normalizeForUI(SEED_MARKET_INTELLIGENCE, period);
        setData(normalized);
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
  const headlineFeed = (data && data.headlineSample) || ui.headlineSample || [];
  const marketChangesTimeline = editMode && editDraft
    ? buildTimelineFallback(editDraft.marketChangesToday || [], tfShort)
    : deriveTimelineMerged(
        showing.marketChangesTimeline || [],
        crossAssetSignals,
        keyDrivers,
        marketChangesToday || [],
        tfShort
      );
  const deskForInference = {
    ...showing,
    riskEngine: showing.riskEngine ?? ui.riskEngine,
    headlineInsights: outlookSnapshot.headlineInsights || [],
    headlineSample: headlineFeed,
    marketChangesTimeline,
    outlookRiskContext: outlookSnapshot.outlookRiskContext ?? ui.outlookRiskContext,
  };
  const implicationsDecision = buildImplicationsDecisionModel(deskForInference);
  const outlookMicroRows = buildOutlookSecondaryMicroRowsDense(deskForInference, { maxRows: 24 });
  const instrumentSnapshots = deriveInstrumentSnapshotsMerged(
    outlookSnapshot.instrumentSnapshots,
    crossAssetSignals,
    keyDrivers
  );
  const headlineInsights = outlookSnapshot.headlineInsights || [];
  const headlineFallbackLines = deriveHeadlineFallbackLines(crossAssetSignals, keyDrivers);
  const outlookRiskContext = outlookSnapshot.outlookRiskContext;
  const outlookDataStatus = outlookSnapshot.outlookDataStatus;
  const marketPulseForGauge = editMode && editDraft
    ? { ...editDraft.marketPulse, outlookPulse: ui.marketPulse?.outlookPulse || null }
    : showing.marketPulse;

  const sessionContextLive = (data && data.sessionContext) || ui.sessionContext || null;
  let sessionFallbackPairs = regimeSessionFallbackPairs(marketRegime || {});
  if (!sessionFallbackPairs.length && (marketPulse?.score != null || marketPulse?.label)) {
    sessionFallbackPairs = [
      ['Desk pulse', `${marketPulse.score ?? '—'}/100 · ${String(marketPulse.label || '').trim() || '—'}`],
    ];
  }
  if (!sessionFallbackPairs.length && keyDrivers[0]) {
    const d0 = keyDrivers[0];
    const line = `${String(d0.name || '').trim()}: ${String(d0.effect || d0.explanation || '').trim()}`.trim();
    if (line.length > 4) sessionFallbackPairs = [['Lead driver', line.slice(0, 200)]];
  }
  if (!sessionFallbackPairs.length && crossAssetSignals[0]) {
    const line = signalLine(crossAssetSignals[0]);
    if (line) sessionFallbackPairs = [['Cross-asset', line]];
  }

  const riskDerivedLines = buildDerivedRiskFallbackLines(marketPulse, keyDrivers, outlookRiskContext);
  const traderFocusEffective = deriveTraderFocusMerged(traderFocus, keyDrivers);

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
      <div className="td-deck-mo-root td-deck-mo-outlook td-deck-mo-outlook--concept">
          <header className="td-outlook-unified-header td-deck-mo-outlook-hero td-outlook-concept-page-header">
            <div className="td-deck-mo-outlook-hero-text">
              <p className="td-deck-mo-eyebrow">Aura Terminal</p>
              <h1 className="td-outlook-main-title td-outlook-concept-page-title">{mainTitle}</h1>
              {outlookDataStatus ? (
                <div className="mo-outlook-freshness" role="status" aria-live="polite">
                  <span className="mo-outlook-freshness__label">{outlookDataStatus.freshnessLabel || '—'}</span>
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
                      {(sessionContextLive || sessionFallbackPairs.length > 0) ? (
                      <section className="td-outlook-concept-card td-outlook-concept-card--session mo-card-shell" aria-label="Session context">
                        <h2 className="td-outlook-concept-card__title mo-section-header">Session Context</h2>
                        <div className="td-outlook-concept-card__body td-outlook-concept-card__body--session">
                          {sessionContextLive ? (
                            <SessionContextPanel sessionContext={sessionContextLive} />
                          ) : (
                            <dl className="mo-session-regime-fallback">
                              {sessionFallbackPairs.map(([k, v]) => (
                                <Fragment key={k}>
                                  <dt>{k}</dt>
                                  <dd>{String(v)}</dd>
                                </Fragment>
                              ))}
                            </dl>
                          )}
                        </div>
                      </section>
                      ) : null}
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
                      {(instrumentSnapshots || []).filter(Boolean).length > 0 ? (
                      <section className="td-outlook-concept-card td-outlook-concept-card--instruments mo-card-shell" aria-label="Instrument snapshots">
                        <h2 className="td-outlook-concept-card__title">Instrument Snapshots</h2>
                        <div className="td-outlook-concept-card__body td-outlook-concept-card__body--instruments">
                            <div className="mo-instrument-grid mo-instrument-grid--compact">
                              {(instrumentSnapshots || []).slice(0, 8).map((card, idx) => (
                                <article key={card.symbol || `snap-${idx}`} className="mo-instrument-card">
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
                      ) : null}
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

                  {(implicationsDecision.scenario || implicationsDecision.keyTheme || implicationsDecision.bullets.length > 0) ? (
                  <section
                    className="td-outlook-concept-card td-outlook-concept-card--implications mo-card-shell mo-card-shell--dense"
                    aria-label="Market implications"
                  >
                    <h2 className="td-outlook-concept-card__title">Market Implications</h2>
                    <div className="td-outlook-concept-card__body td-outlook-concept-card__body--implications">
                        <div className="mo-implications-decision-grid">
                          <div className="mo-implications-decision-col mo-implications-decision-col--narrative">
                            {implicationsDecision.scenario ? (
                              <>
                                <span className="mo-implications-kicker">Scenario</span>
                                <p className="mo-implications-scenario">{implicationsDecision.scenario}</p>
                              </>
                            ) : null}
                            {implicationsDecision.keyTheme ? (
                              <>
                                <span className="mo-implications-kicker">Key theme</span>
                                <p className="mo-implications-theme">{implicationsDecision.keyTheme}</p>
                              </>
                            ) : null}
                          </div>
                          {implicationsDecision.bullets.length > 0 ? (
                          <div className="mo-implications-decision-col mo-implications-decision-col--action">
                            <span className="mo-implications-kicker">Actionable</span>
                              <ul className="mo-implications-action-list">
                                {implicationsDecision.bullets.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                          </div>
                          ) : null}
                        </div>
                    </div>
                  </section>
                  ) : null}

                  <section className="td-outlook-concept-card td-outlook-concept-card--focus mo-card-shell" aria-label="Trader focus">
                    <h2 className="td-outlook-concept-card__title">Trader Focus</h2>
                    <div className="td-outlook-concept-card__body">
                      {editMode && editDraft ? (
                        renderListEdit(editDraft.traderFocus, 'traderFocus', 'Focus item')
                      ) : traderFocusEffective.length > 0 ? (
                        <FocusList items={traderFocusEffective} />
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
                      ) : riskDerivedLines.length > 0 ? (
                        <ul className="mo-risk-fallback-lines td-mi-bullets">
                          {riskDerivedLines.map((line, i) => (
                            <li key={i} className="td-mi-bullet-item">{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </section>

                  {(headlineInsights && headlineInsights.length > 0) || headlineFeed.length > 0 || headlineFallbackLines.length > 0 ? (
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
                          {headlineInsights.slice(0, 12).map((row, i) => (
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
                          {headlineFeed.slice(0, 12).map((line, i) => (
                            <li key={i} className="mo-terminal-feed__row">
                              <span className="mo-terminal-feed__text">{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="mo-terminal-feed">
                          {headlineFallbackLines.slice(0, 12).map((line, i) => (
                            <li key={i} className="mo-terminal-feed__row">
                              <span className="mo-terminal-feed__text">{line}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mo-terminal-feed__note">Event detail in the Economic Calendar below.</p>
                    </div>
                  </section>
                  ) : null}

                  {outlookMicroRows.length > 0 ? (
                    <section className="td-outlook-concept-card td-outlook-concept-card--aux mo-card-shell mo-card-shell--dense" aria-label="Cross-links and headline overflow">
                      <h2 className="td-outlook-concept-card__title">More desk lines</h2>
                      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--aux">
                        <ul className="mo-outlook-micro-rows">
                          {outlookMicroRows.map((line, i) => (
                            <li key={i} className="mo-outlook-micro-rows__item">{line}</li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </>
  );
}
