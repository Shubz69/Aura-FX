/**
 * Market Intelligence data for Trader Desk.
 * Fetches from backend /api/trader-deck/market-intelligence.
 * Maps API response to dashboard shape; falls back to seed if request fails.
 */

import Api from '../services/Api';

export const DEFAULT_MARKET_REGIME = {
  currentRegime: '',
  primaryDriver: '',
  secondaryDriver: '',
  marketSentiment: '',
};

export const DEFAULT_MARKET_PULSE = { value: 50, label: 'NEUTRAL' };

export const SEED_MARKET_INTELLIGENCE = {
  marketRegime: {
    currentRegime: 'Rate Sensitivity',
    primaryDriver: 'Bond Yields',
    secondaryDriver: 'US Economic Data',
    marketSentiment: 'Neutral',
  },
  marketPulse: { value: 50, label: 'NEUTRAL' },
  keyDrivers: [
    { title: 'Bond Yields', direction: 'up', impact: 'High' },
    { title: 'US Dollar', direction: 'up', impact: 'Medium' },
    { title: 'Oil Prices', direction: 'down', impact: 'Low' },
    { title: 'Geopolitical Risk', direction: 'up', impact: 'Medium' },
  ],
  crossAssetSignals: [
    { asset: 'Yields', direction: 'up', label: 'Bullish' },
    { asset: 'USD', direction: 'up', label: 'Strong' },
    { asset: 'Gold', direction: 'down', label: 'Bearish' },
    { asset: 'Stocks', direction: 'neutral', label: 'Neutral' },
    { asset: 'Oil', direction: 'up', label: 'Rising' },
  ],
  marketChangesToday: ['Strong US Jobs Data', 'Bond Yields Surging', 'USD Gaining Strength', 'Gold Under Pressure'],
  traderFocus: ['Watch US bond yields', 'Monitor EURUSD levels', "Track gold's reaction to yields"],
  riskRadar: ['Upcoming CPI Report', 'Fed Speakers Today', 'Geopolitical Tensions'],
};

function capitalize(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
          primaryDriver: r.primaryDriver || '',
          secondaryDriver: r.secondaryDriver || '',
          marketSentiment: r.marketSentiment || 'Neutral',
        }
      : SEED_MARKET_INTELLIGENCE.marketRegime,
    marketPulse: p
      ? { value: typeof p.score === 'number' ? p.score : 50, label: p.label || 'NEUTRAL' }
      : SEED_MARKET_INTELLIGENCE.marketPulse,
    keyDrivers: Array.isArray(k)
      ? k.map((d) => ({
          title: d.name || d.title || '',
          direction: d.direction || 'neutral',
          impact: capitalize(d.impact) || 'Medium',
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
      ? rr.map((x) => (typeof x === 'string' ? x : x.title || x.text || ''))
      : SEED_MARKET_INTELLIGENCE.riskRadar,
    updatedAt: apiData.updatedAt || null,
    aiSessionBrief: typeof apiData.aiSessionBrief === 'string' ? apiData.aiSessionBrief : '',
    aiTradingPriorities: Array.isArray(apiData.aiTradingPriorities) ? apiData.aiTradingPriorities : [],
  };
}

export async function getMarketIntelligence({ refresh = false } = {}) {
  try {
    const res = await Api.getTraderDeckMarketIntelligence(refresh);
    const data = res && res.data;
    if (data && data.success && (data.marketRegime || data.marketPulse)) {
      return mapBackendToDashboard(data);
    }
  } catch (e) {
    // Fallback to seed on network or API error
  }
  return SEED_MARKET_INTELLIGENCE;
}
