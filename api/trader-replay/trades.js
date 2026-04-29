const { verifyToken } = require('../utils/auth');
const {
  loadReplayableTradesForUser,
  loadReplayTradeByIdForUser,
} = require('./tradeSources');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getPathname(req) {
  const raw = String(req.url || '').split('?')[0];
  if (!raw.startsWith('http')) return raw;
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
}

function toListItem(trade) {
  return {
    id: trade.replayId,
    sourceId: trade.sourceId,
    source: trade.source,
    symbol: trade.symbol,
    direction: trade.direction,
    openTime: trade.openTime,
    closeTime: trade.closeTime,
    lotSize: trade.lotSize,
    pnl: trade.pnl,
    durationSeconds: trade.durationSeconds,
  };
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  const userId = Number(decoded?.id);
  if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

  try {
    const pathname = getPathname(req);
    const idMatch = pathname.match(/\/api\/trader-replay\/trades\/([^/]+)$/i);
    const replayId = idMatch ? decodeURIComponent(idMatch[1]) : null;
    const source = String(req.query?.source || 'all').toLowerCase();

    if (replayId) {
      const trade = await loadReplayTradeByIdForUser(userId, replayId);
      if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });
      return res.status(200).json({ success: true, trade });
    }

    const trades = await loadReplayableTradesForUser(userId, source);
    return res.status(200).json({
      success: true,
      source,
      count: trades.length,
      trades: trades.map(toListItem),
    });
  } catch (error) {
    console.error('[trader-replay/trades]', error);
    return res.status(500).json({ success: false, message: 'Could not load replay trades' });
  }
};
