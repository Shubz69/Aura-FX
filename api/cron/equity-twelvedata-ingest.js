/**
 * GET /api/cron/equity-twelvedata-ingest — Twelve Data equity fundamentals / reference ingest.
 */

const { runEquityTwelveDataIngest } = require('../market-data/equities/equityIngest');
const { runTwelveDataCronWork } = require('./twelveDataCronContext');

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
  const maxTier = req.query.maxTier ? parseInt(req.query.maxTier, 10) : 2;
  const symbolLimit = req.query.symbolLimit ? parseInt(req.query.symbolLimit, 10) : undefined;
  const includeGlobal = String(req.query.includeGlobal || '1') !== '0';
  try {
    const out = await runTwelveDataCronWork(() =>
      runEquityTwelveDataIngest({ maxTier, symbolLimit, includeGlobal })
    );
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    console.error('[cron/equity-twelvedata-ingest]', e);
    return res.status(500).json({ success: false, message: e.message || 'equity ingest failed' });
  }
};

module.exports.config = { maxDuration: 300 };
