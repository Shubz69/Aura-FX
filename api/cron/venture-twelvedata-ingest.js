/**
 * GET /api/cron/venture-twelvedata-ingest — Twelve Data ingest for config-driven venture_* categories.
 */

const { runCategoryIngest } = require('../market-data/twelve-data-framework/ingestOrchestrator');
const { listVentureCategoryIds, ventureMarketsGloballyEnabled } = require('../market-data/equities/ventureRemainingMarkets');

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
  if (!ventureMarketsGloballyEnabled()) {
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'VENTURE_REGIONAL_MARKETS disabled',
    });
  }
  const maxTier = req.query.maxTier ? parseInt(req.query.maxTier, 10) : 2;
  const symbolLimit = req.query.symbolLimit ? parseInt(req.query.symbolLimit, 10) :25;
  const includeGlobal = String(req.query.includeGlobal || '1') !== '0';
  const ids = listVentureCategoryIds();
  const results = [];
  try {
    /* eslint-disable no-await-in-loop */
    for (const categoryId of ids) {
      const out = await runCategoryIngest(categoryId, {
        maxTier,
        symbolLimit,
        includeGlobal,
      });
      results.push({ categoryId, ...out });
    }
    /* eslint-enable no-await-in-loop */
    return res.status(200).json({ success: true, categories: ids.length, results });
  } catch (e) {
    console.error('[cron/venture-twelvedata-ingest]', e);
    return res.status(500).json({ success: false, message: e.message || 'venture ingest failed' });
  }
};

module.exports.config = { maxDuration: 300 };
