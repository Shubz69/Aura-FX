/**
 * GET /api/trader-deck/market-intelligence
 * Returns Trader Deck market intelligence (regime, pulse, drivers, cross-asset, market changes, trader focus, risk radar).
 * Optional Perplexity desk brief (aiSessionBrief, aiTradingPriorities) when PERPLEXITY_API_KEY is set.
 * Cache: TRADER_DECK_MI_CACHE_SEC (default 90s). ?refresh=1 bypasses cache.
 */

require('../utils/suppress-warnings');

const { runEngine } = require('./marketIntelligenceEngine');
const { enrichTraderDeckPayload } = require('./perplexityTraderInsights');

// Default 90s — override with TRADER_DECK_MI_CACHE_SEC (45–300)
const CACHE_SEC = Math.min(300, Math.max(45, parseInt(process.env.TRADER_DECK_MI_CACHE_SEC, 10) || 90));
const CACHE_TTL_MS = CACHE_SEC * 1000;

const cacheStore = new Map();

function getCached(cacheKey) {
  const entry = cacheStore.get(cacheKey);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.payload;
  return null;
}

function setCache(cacheKey, data) {
  cacheStore.set(cacheKey, { at: Date.now(), payload: data });
}

/** Fallback payload when APIs fail */
function fallbackPayload() {
  return {
    marketRegime: {
      currentRegime: 'Mixed',
      primaryDriver: 'Macro Data',
      secondaryDriver: 'US Economic Data',
      marketSentiment: 'Neutral',
    },
    marketPulse: { state: 'Neutral', score: 50, label: 'NEUTRAL' },
    keyDrivers: [
      { name: 'Bond Yields', direction: 'neutral', impact: 'high', biasLabel: '—' },
      { name: 'US Dollar', direction: 'neutral', impact: 'medium', biasLabel: '—' },
      { name: 'Oil Prices', direction: 'neutral', impact: 'low', biasLabel: '—' },
      { name: 'Geopolitical Risk', direction: 'neutral', impact: 'medium', biasLabel: 'Monitor' },
    ],
    crossAssetSignals: [
      { asset: 'Yields', signal: 'Neutral', direction: 'neutral' },
      { asset: 'USD', signal: 'Neutral', direction: 'neutral' },
      { asset: 'Gold', signal: 'Neutral', direction: 'neutral' },
      { asset: 'Stocks', signal: 'Neutral', direction: 'neutral' },
      { asset: 'Oil', signal: '—', direction: 'neutral' },
    ],
    marketChangesToday: [{ title: 'Data temporarily unavailable', priority: 'low' }],
    traderFocus: [
      { title: 'Watch US bond yields', reason: 'Primary macro driver' },
      { title: 'Monitor EURUSD levels', reason: 'FX sensitivity' },
      { title: "Track gold's reaction to yields", reason: 'Inverse correlation' },
    ],
    riskRadar: [
      { title: 'Upcoming CPI Report', severity: 'high', category: 'US' },
      { title: 'Fed speakers this week', severity: 'medium', category: 'US' },
      { title: 'Geopolitical tensions', severity: 'medium', category: 'Global' },
    ],
    updatedAt: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const q = req.query || {};
  const forceRefresh = q.refresh === '1' || q.refresh === 'true';
  const timeframe = q.timeframe === 'weekly' ? 'weekly' : 'daily';
  const date = q.date != null && String(q.date).trim() !== '' ? String(q.date).trim().slice(0, 10) : '';
  const cacheKey = `${timeframe}:${date || 'live'}`;
  const fromCache = forceRefresh ? null : getCached(cacheKey);
  if (fromCache) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ success: true, ...fromCache, timeframe, date: date || null, cached: true });
  }

  try {
    const raw = await runEngine({ timeframe, date });
    let enriched = null;
    try {
      enriched = await enrichTraderDeckPayload(raw);
    } catch (e) {
      console.warn('[trader-deck] enrichTraderDeckPayload:', e.message || e);
    }
    const { headlineSample: _hs, ...rest } = raw;
    const payload = {
      ...rest,
      ...(enriched || {}),
    };
    setCache(cacheKey, payload);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.status(200).json({ success: true, ...payload, timeframe, date: date || null, cached: false });
  } catch (err) {
    console.warn('[trader-deck] market-intelligence error:', err.message || err);
    const fallback = fallbackPayload();
    res.status(200).json({ success: true, ...fallback });
  }
};
