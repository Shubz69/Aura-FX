/**
 * Market Intelligence data for Trader Desk.
 * Fetches from backend /api/trader-deck/market-intelligence.
 * Maps API response to dashboard shape; falls back to seed if request fails.
 */

import Api from '../services/Api';

export const DEFAULT_MARKET_REGIME = {
  currentRegime: '',
  bias: '',
  primaryDriver: '',
  secondaryDriver: '',
  marketSentiment: '',
  tradeEnvironment: '',
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
  },
  marketPulse: {
    value: 50,
    label: 'MIXED',
    recommendedAction: [
      'Reduce position size around clustered events',
      'Wait for confirmation before directional commitment',
      'Expect volatility spikes at session handovers',
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
  traderFocus: ['Avoid adding risk before high-impact events', 'Watch bond yields for equity/gold inflections', 'Expect volatility into session opens', 'Reduce risk when events cluster', 'Use confirmation-based entries'],
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
};

function capitalize(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
  return {
    marketRegime: r
      ? {
          currentRegime: r.currentRegime || '',
          bias: r.bias || '',
          primaryDriver: r.primaryDriver || '',
          secondaryDriver: r.secondaryDriver || '',
          marketSentiment: r.marketSentiment || 'Neutral / Mixed',
          tradeEnvironment: r.tradeEnvironment || '',
        }
      : SEED_MARKET_INTELLIGENCE.marketRegime,
    marketPulse: p
      ? {
          value: typeof p.score === 'number' ? p.score : 50,
          label: p.label || 'MIXED',
          recommendedAction: Array.isArray(p.recommendedAction) ? p.recommendedAction : [],
        }
      : SEED_MARKET_INTELLIGENCE.marketPulse,
    keyDrivers: Array.isArray(k)
      ? k.map((d) => ({
          title: d.name || d.title || '',
          direction: d.direction || 'neutral',
          impact: capitalize(d.impact) || 'Medium',
          effect: d.effect || '',
        }))
      : SEED_MARKET_INTELLIGENCE.keyDrivers,
    crossAssetSignals: Array.isArray(c)
      ? c.map((s) => ({
          asset: s.asset || '',
          direction: s.direction || 'neutral',
          label: s.signal || s.label || '—',
        }))
      : SEED_MARKET_INTELLIGENCE.crossAssetSignals,
    marketChangesToday: Array.isArray(m)
      ? m.map((x) => (typeof x === 'string' ? x : x.title || x.description || ''))
      : SEED_MARKET_INTELLIGENCE.marketChangesToday,
    traderFocus: Array.isArray(t)
      ? t.map((x) => (typeof x === 'string' ? x : x.title || x.text || ''))
      : SEED_MARKET_INTELLIGENCE.traderFocus,
    riskRadar: Array.isArray(rr)
      ? rr.map(normalizeRiskRadarItem).filter((x) => x !== '')
      : SEED_MARKET_INTELLIGENCE.riskRadar,
    riskEngine: apiData.riskEngine && typeof apiData.riskEngine === 'object'
      ? apiData.riskEngine
      : SEED_MARKET_INTELLIGENCE.riskEngine,
    updatedAt: apiData.updatedAt || null,
    aiSessionBrief: typeof apiData.aiSessionBrief === 'string' ? apiData.aiSessionBrief : '',
    aiTradingPriorities: Array.isArray(apiData.aiTradingPriorities) ? apiData.aiTradingPriorities : [],
  };
}

export async function getMarketIntelligence({ refresh = false, timeframe = 'daily', date = '' } = {}) {
  try {
    const res = await Api.getTraderDeckMarketIntelligence(refresh, { timeframe, date });
    const data = res && res.data;
    if (data && data.success && (data.marketRegime || data.marketPulse)) {
      return mapBackendToDashboard(data);
    }
  } catch (e) {
    // Fallback to seed on network or API error
  }
  return SEED_MARKET_INTELLIGENCE;
}
