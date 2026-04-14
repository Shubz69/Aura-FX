const { runMorningIngestion } = require('../market-data/pipeline-service');
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

  try {
    const result = await runTwelveDataCronWork(() => runMorningIngestion());
    return res.status(200).json(result);
  } catch (error) {
    console.error('[cron/market-data-ingest]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Market data ingestion failed',
    });
  }
};

module.exports.config = {
  maxDuration: 300,
};
