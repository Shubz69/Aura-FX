/**
 * GET /api/cron/ohlcv-incremental — tier-1 daily OHLCV upsert (Twelve Data → MySQL).
 */

const { runTier1Incremental, runFxPriorityDeepBackfill } = require('../market-data/ohlcvIngest');

function isAuthorized(req) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
  const isVercelCronHeader = req.headers['x-vercel-cron'] === '1';
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isVercelCronUA = userAgent.includes('vercel-cron');
  return isVercelCronHeader || hasValidSecret || (isVercelCronUA && process.env.VERCEL);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  if (!isAuthorized(req) && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 80;
  const deep = String(req.query.deep || '') === '1' || String(req.query.deep || '').toLowerCase() === 'true';
  const deepPairs = req.query.deepPairs ? parseInt(req.query.deepPairs, 10) : 6;
  const deepChunks = req.query.deepChunks ? parseInt(req.query.deepChunks, 10) : 10;
  try {
    const out = await runTier1Incremental(limit);
    let fxDeep = null;
    if (deep) {
      fxDeep = await runFxPriorityDeepBackfill(deepPairs, deepChunks);
    }
    return res.status(200).json({ success: true, ...out, fxDeepBackfill: fxDeep });
  } catch (e) {
    console.error('[cron/ohlcv-incremental]', e);
    return res.status(500).json({ success: false, message: e.message || 'ohlcv incremental failed' });
  }
};

module.exports.config = {
  maxDuration: 300,
};
