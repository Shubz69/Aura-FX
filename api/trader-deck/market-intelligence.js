/**
 * GET /api/trader-deck/market-intelligence
 * Returns Trader Deck market intelligence (regime, pulse, drivers, cross-asset, market changes, trader focus, risk radar).
 * Server-side only; keys never exposed. Cached 2 minutes.
 */

const { runEngine } = require('./marketIntelligenceEngine');

// Cache TTL: MARKET_DATA_REFRESH_INTERVAL (seconds) or default 300 (5 min) to avoid API rate limits
const REFRESH_SEC = Math.max(60, parseInt(process.env.MARKET_DATA_REFRESH_INTERVAL, 10) || 300);
const CACHE_TTL_MS = REFRESH_SEC * 1000;

let cached = null;
let cachedAt = 0;

function getCached() {
  if (cached != null && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  return null;
}

function setCache(data) {
  cached = data;
  cachedAt = Date.now();
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

  const fromCache = getCached();
  if (fromCache) {
    return res.status(200).json({ success: true, ...fromCache });
  }

  try {
    const payload = await runEngine();
    setCache(payload);
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    console.warn('[trader-deck] market-intelligence error:', err.message || err);
    const fallback = fallbackPayload();
    res.status(200).json({ success: true, ...fallback });
  }
};
