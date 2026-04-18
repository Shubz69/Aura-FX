/**
 * Market Intelligence data for Trader Desk.
 * Fetches from backend /api/trader-deck/market-intelligence.
 * Maps API response to dashboard shape; falls back to seed if request fails.
 */

import Api from '../services/Api';
import { sanitizeTraderDeskPayloadDeep } from '../utils/sanitizeAiDeskOutput.react.js';

export const DEFAULT_MARKET_REGIME = {
  currentRegime: '',
  bias: '',
  primaryDriver: '',
  secondaryDriver: '',
  marketSentiment: '',
  tradeEnvironment: '',
  biasStrength: '',
  convictionClarity: '',
};

export const DEFAULT_MARKET_PULSE = { value: 50, label: 'NEUTRAL' };

export const SEED_MARKET_INTELLIGENCE = {
  marketRegime: {
    currentRegime: 'Rate Sensitivity',
    bias: 'Mixed',
    primaryDriver: 'Bond Yields',
    secondaryDriver: 'Macro Data + Commodities + Cross-asset flows',
    marketSentiment: 'Neutral / Mixed',
    tradeEnvironment: 'Event-Driven',
    biasStrength: 'Moderate',
    convictionClarity: 'Mixed',
  },
  marketPulse: {
    value: 50,
    label: 'MIXED',
    recommendedAction: [
      'Mixed tape: macro narratives can rotate quickly between rates, USD, and growth',
      'Liquidity depth reshapes at London–NY overlaps',
      'Cross-asset dispersion often rises when regions diverge on data',
    ],
  },
  keyDrivers: [
    { title: 'Bond Yields', direction: 'up', impact: 'High', effect: 'Pressure on equities and gold' },
    { title: 'US Dollar', direction: 'up', impact: 'High', effect: 'FX and commodities repricing' },
    { title: 'Oil Prices', direction: 'down', impact: 'Medium', effect: 'Shifts inflation and risk tone' },
    { title: 'Equity Markets', direction: 'neutral', impact: 'High', effect: 'Risk appetite transmission across assets' },
  ],
  crossAssetSignals: [
    { asset: 'Yields', direction: 'up', label: 'Bullish' },
    { asset: 'USD', direction: 'up', label: 'Strong' },
    { asset: 'Gold', direction: 'down', label: 'Bearish' },
    { asset: 'Stocks', direction: 'neutral', label: 'Neutral' },
    { asset: 'Oil', direction: 'up', label: 'Supported by geopolitical risk' },
    { asset: 'Crypto', direction: 'neutral', label: 'Following broad risk sentiment' },
    { asset: 'Volatility', direction: 'neutral', label: 'Elevated' },
    { asset: 'DXY RSI', direction: 'neutral', label: 'Neutral zone' },
  ],
  marketChangesToday: ['USD strength increased after macro repricing', 'Gold reacted to real-yield and risk tone', 'Equities lost momentum into later sessions', 'Crypto stayed defensive versus risk benchmarks'],
  traderFocus: [
    { title: 'High-impact event windows concentrate correlation resets', reason: 'Macro calendar structure' },
    { title: 'Bond yields remain the hinge between duration, gold, and USD', reason: 'Primary macro driver' },
    { title: 'Session opens often reshape depth and short-horizon variance', reason: 'Liquidity windows' },
    { title: 'Clustered releases can bunch realized volatility in tight clocks', reason: 'Event spacing' },
    { title: 'Cross-asset dispersion signals narrative rotation early', reason: 'Macro structure' },
  ],
  riskRadar: [
    {
      title: 'US CPI y/y',
      time: '08:30',
      currency: 'USD',
      impact: 'high',
      forecast: '3.2%',
      previous: '3.1%',
      actual: null,
    },
    {
      title: 'Fed speakers (panel)',
      time: '14:00',
      currency: 'USD',
      impact: 'medium',
      forecast: null,
      previous: null,
      actual: null,
    },
    {
      title: 'ECB deposit rate',
      time: '12:45',
      currency: 'EUR',
      impact: 'high',
      forecast: '4.50%',
      previous: '4.50%',
      actual: null,
    },
  ],
  riskEngine: {
    score: 58,
    level: 'Moderate',
    breakdown: { eventRisk: 62, geopoliticalRisk: 54, volatility: 60, liquidity: 46, clustering: 51 },
    nextRiskEventInMins: 45,
  },
  headlineSample: [
    'Rates narrative and liquidity expectations continued to drive cross-asset repricing',
    'USD tone remained a key filter for majors and commodities',
    'Volatility clustered around scheduled macro releases',
  ],
  sessionContext: {
    currentSession: 'overlap',
    sessions: {
      asia: {
        state: 'range_bound',
        confidence: 0.72,
        tags: ['mean reversion'],
        summary: 'Realized drift small versus recent vol; mean-reversion bias until range breaks with volume.',
        liquidityBias: 'building',
        volatilityState: 'normal',
        eventRisk: 'moderate',
        updatedAt: null,
      },
      london: {
        state: 'expansion_likely',
        confidence: 0.78,
        tags: ['correlation aligned'],
        summary: 'Yields/FX impulse building; watch VIX for follow-through quality.',
        liquidityBias: 'normal',
        volatilityState: 'normal',
        eventRisk: 'moderate',
        updatedAt: null,
      },
      newYork: {
        state: 'event_sensitive',
        confidence: 0.84,
        tags: ['high-impact window'],
        summary: 'Next major release window approaching; headline clocks concentrate two-way repricing risk.',
        liquidityBias: 'normal',
        volatilityState: 'normal',
        eventRisk: 'high',
        updatedAt: null,
      },
    },
  },
};

function capitalize(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const SESSION_STATE_LABELS = {
  range_bound: 'Range-bound',
  expansion_likely: 'Expansion likely',
  trend_continuation: 'Trend continuation',
  reversal_risk: 'Reversal risk',
  compressed: 'Compressed',
  choppy: 'Choppy',
  event_sensitive: 'Event-sensitive',
  liquidity_build: 'Liquidity build',
  inactive: 'Inactive',
};

function normalizeSessionRow(r) {
  if (!r || typeof r !== 'object') return null;
  const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 2) : [];
  return {
    ...r,
    state: typeof r.state === 'string' ? r.state : 'range_bound',
    confidence: typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : null,
    tags,
    summary: typeof r.summary === 'string' ? r.summary : '',
    liquidityBias: r.liquidityBias != null ? String(r.liquidityBias) : '',
    volatilityState: r.volatilityState != null ? String(r.volatilityState) : '',
    eventRisk: r.eventRisk != null ? String(r.eventRisk) : '',
    updatedAt: r.updatedAt != null ? String(r.updatedAt) : null,
  };
}

function normalizeSessionContext(sc) {
  if (!sc || typeof sc !== 'object') return null;
  const sessions = sc.sessions || {};
  const asia = normalizeSessionRow(sessions.asia);
  const london = normalizeSessionRow(sessions.london);
  const newYork = normalizeSessionRow(sessions.newYork);
  if (!asia && !london && !newYork) return null;
  return {
    currentSession: typeof sc.currentSession === 'string' ? sc.currentSession : 'closed',
    sessions: {
      asia: asia || { state: 'inactive', confidence: null, tags: [], summary: '', liquidityBias: '', volatilityState: '', eventRisk: '', updatedAt: null },
      london: london || { state: 'inactive', confidence: null, tags: [], summary: '', liquidityBias: '', volatilityState: '', eventRisk: '', updatedAt: null },
      newYork: newYork || { state: 'inactive', confidence: null, tags: [], summary: '', liquidityBias: '', volatilityState: '', eventRisk: '', updatedAt: null },
    },
  };
}

export function sessionStateDisplayLabel(stateKey) {
  if (!stateKey || typeof stateKey !== 'string') return '—';
  return SESSION_STATE_LABELS[stateKey] || stateKey.replace(/_/g, ' ');
}

/** Preserve API risk radar rows (time, impact, actuals); legacy strings become minimal objects. */
function normalizeRiskRadarItem(x) {
  if (x == null) return '';
  if (typeof x === 'string') {
    return {
      title: x,
      impact: 'medium',
      currency: 'GLB',
      time: null,
      forecast: null,
      previous: null,
      actual: null,
    };
  }
  if (typeof x !== 'object') return '';
  const rawImpact = x.impact ?? x.severity ?? '';
  const impact =
    typeof rawImpact === 'number'
      ? rawImpact >= 3
        ? 'high'
        : rawImpact >= 2
          ? 'medium'
          : rawImpact >= 1
            ? 'low'
            : 'medium'
      : String(rawImpact || '').toLowerCase() || 'medium';
  return {
    title: x.title || x.event || x.text || x.name || '—',
    time: x.time ?? x.date ?? x.datetime ?? null,
    impact: impact || 'medium',
    forecast: x.forecast ?? x.estimate ?? x.fcst ?? null,
    previous: x.previous ?? x.prior ?? null,
    actual: x.actual ?? x.value ?? null,
    currency: x.currency || x.category || null,
  };
}

function mapBackendToDashboard(apiData) {
  if (!apiData || typeof apiData !== 'object') return null;
  const r = apiData.marketRegime;
  const p = apiData.marketPulse;
  const k = apiData.keyDrivers;
  const c = apiData.crossAssetSignals;
  const m = apiData.marketChangesToday;
  const t = apiData.traderFocus;
  const rr = apiData.riskRadar;
  return sanitizeTraderDeskPayloadDeep({
    marketRegime: r
      ? {
          ...r,
          currentRegime: r.currentRegime || '',
          bias: r.bias || '',
          primaryDriver: r.primaryDriver || '',
          secondaryDriver: r.secondaryDriver || '',
          marketSentiment: r.marketSentiment || 'Neutral / Mixed',
          tradeEnvironment: r.tradeEnvironment || '',
          biasStrength: r.biasStrength != null ? String(r.biasStrength) : '',
          convictionClarity: r.convictionClarity != null ? String(r.convictionClarity) : '',
        }
      : SEED_MARKET_INTELLIGENCE.marketRegime,
    marketPulse: p
      ? {
          ...p,
          value: typeof p.score === 'number' ? p.score : (p.value != null ? p.value : 50),
          score: typeof p.score === 'number' ? p.score : (p.value != null ? p.value : 50),
          label: p.label || 'MIXED',
          recommendedAction: Array.isArray(p.recommendedAction) ? p.recommendedAction : [],
          outlookPulse: p.outlookPulse && typeof p.outlookPulse === 'object' ? p.outlookPulse : null,
        }
      : SEED_MARKET_INTELLIGENCE.marketPulse,
    keyDrivers: Array.isArray(k)
      ? k.map((d) => ({
          name: d.name || d.title || '',
          title: d.name || d.title || '',
          direction: d.direction || 'neutral',
          impact: capitalize(d.impact) || 'Medium',
          effect: d.effect || '',
          explanation: typeof d.explanation === 'string' ? d.explanation : '',
          affectedAssets: Array.isArray(d.affectedAssets) ? d.affectedAssets : [],
        }))
      : SEED_MARKET_INTELLIGENCE.keyDrivers,
    crossAssetSignals: Array.isArray(c)
      ? c.map((s) => ({
          asset: s.asset || '',
          direction: s.direction || 'neutral',
          label: s.signal || s.label || '—',
          signal: s.signal || s.label || '—',
          strength: typeof s.strength === 'string' ? s.strength : '',
          implication: typeof s.implication === 'string' ? s.implication : '',
        }))
      : SEED_MARKET_INTELLIGENCE.crossAssetSignals,
    marketChangesToday: Array.isArray(m)
      ? m.map((x) => (typeof x === 'string' ? x : x.title || x.description || ''))
      : SEED_MARKET_INTELLIGENCE.marketChangesToday,
    traderFocus: Array.isArray(t)
      ? t.map((x) =>
          typeof x === 'string'
            ? { title: x, reason: '' }
            : {
                title: x.title || x.text || '',
                reason: typeof x.reason === 'string' ? x.reason : '',
              },
        )
      : SEED_MARKET_INTELLIGENCE.traderFocus.map((x) =>
          typeof x === 'string' ? { title: x, reason: '' } : x,
        ),
    riskRadar: Array.isArray(rr)
      ? rr.map(normalizeRiskRadarItem).filter((x) => x !== '')
      : SEED_MARKET_INTELLIGENCE.riskRadar,
    riskEngine: apiData.riskEngine && typeof apiData.riskEngine === 'object'
      ? apiData.riskEngine
      : SEED_MARKET_INTELLIGENCE.riskEngine,
    updatedAt: apiData.updatedAt || null,
    aiSessionBrief: typeof apiData.aiSessionBrief === 'string' ? apiData.aiSessionBrief : '',
    aiTradingPriorities: Array.isArray(apiData.aiTradingPriorities) ? apiData.aiTradingPriorities : [],
    headlineSample: Array.isArray(apiData.headlineSample)
      ? apiData.headlineSample.map((h) => String(h || '').trim()).filter(Boolean)
      : SEED_MARKET_INTELLIGENCE.headlineSample || [],
    headlineInsights: Array.isArray(apiData.headlineInsights) ? apiData.headlineInsights : [],
    sessionContext: normalizeSessionContext(apiData.sessionContext),
    marketChangesTimeline: Array.isArray(apiData.marketChangesTimeline) ? apiData.marketChangesTimeline : [],
    marketImplications: Array.isArray(apiData.marketImplications) ? apiData.marketImplications : [],
    instrumentSnapshots: Array.isArray(apiData.instrumentSnapshots) ? apiData.instrumentSnapshots : [],
    outlookRiskContext: apiData.outlookRiskContext && typeof apiData.outlookRiskContext === 'object'
      ? apiData.outlookRiskContext
      : null,
    outlookDataStatus: apiData.outlookDataStatus && typeof apiData.outlookDataStatus === 'object'
      ? apiData.outlookDataStatus
      : null,
    marketOutlookVersion: apiData.marketOutlookVersion != null ? apiData.marketOutlookVersion : null,
    dataQuality: apiData.dataQuality || 'live',
    degradedReason: apiData.degradedReason ?? null,
  });
}

export async function getMarketIntelligence({ refresh = false, timeframe = 'daily', date = '' } = {}) {
  try {
    const res = await Api.getTraderDeckMarketIntelligence(refresh, { timeframe, date });
    const data = res && res.data;
    if (data && data.success && (data.marketRegime || data.marketPulse)) {
      return mapBackendToDashboard(data);
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[getMarketIntelligence] request failed, using offline seed', e?.message || e);
    }
    return {
      ...SEED_MARKET_INTELLIGENCE,
      dataQuality: 'client_seed',
      degradedReason: e?.message || 'request_failed',
    };
  }
  return {
    ...SEED_MARKET_INTELLIGENCE,
    dataQuality: 'client_seed',
    degradedReason: 'invalid_or_empty_response',
  };
}
