const axios = require('axios');
const { verifyToken } = require('../utils/auth');
const { loadReplayTradeByIdForUser } = require('./tradeSources');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function toUnix(value) {
  const ms = new Date(value || '').getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  const userId = Number(decoded?.id);
  if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

  try {
    const tradeId = String(req.query?.tradeId || '').trim();
    const interval = String(req.query?.interval || '15');
    if (!tradeId) return res.status(400).json({ success: false, message: 'tradeId is required' });

    const trade = await loadReplayTradeByIdForUser(userId, tradeId);
    if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });
    if (!trade.symbol) return res.status(400).json({ success: false, message: 'Trade symbol unavailable' });

    const entryTs = toUnix(trade.openTime);
    const exitTs = toUnix(trade.closeTime) || entryTs;
    const beforeSec = 72 * 3600;
    const afterSec = 72 * 3600;
    const from = Number.isFinite(entryTs) ? Math.max(0, entryTs - beforeSec) : null;
    const to = Number.isFinite(exitTs) ? exitTs + afterSec : null;

    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const baseUrl = `${proto}://${host}`;
    const { data } = await axios.get(`${baseUrl}/api/market/chart-history`, {
      params: {
        symbol: trade.symbol,
        interval,
        ...(from != null ? { from } : {}),
        ...(to != null ? { to } : {}),
      },
      headers: {
        Authorization: req.headers.authorization || '',
      },
      timeout: 15000,
    });

    return res.status(200).json({
      success: true,
      tradeId,
      symbol: trade.symbol,
      interval,
      from,
      to,
      bars: Array.isArray(data?.bars) ? data.bars : [],
      source: data?.source || 'market-chart-history',
    });
  } catch (error) {
    console.error('[trader-replay/candles]', error?.message || error);
    return res.status(500).json({ success: false, message: 'Could not load replay candles' });
  }
};
