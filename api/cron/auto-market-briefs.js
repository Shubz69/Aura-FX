/**
 * Cron Job: Automated Daily/Weekly market briefs.
 * Daily: ~00:00 UK — full outlook + brief set (brief date = new calendar day in London).
 * Daily prefetch: ~22:00 UK — per-instrument OpenAI research layer stored for the next day’s briefs.
 * Weekly: Sunday 18:00 UK (Europe/London).
 */
const {
  generateAndStoreOutlook,
  generateAndStoreBriefSet,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldPrefetchInstrumentResearchWindow,
} = require('../trader-deck/services/autoBriefGenerator');

function hasAutomationModelConfigured() {
  return Boolean(String(process.env.OPENAI_AUTOMATION_MODEL || '').trim());
}

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
  if (!hasAutomationModelConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Automation blocked: OPENAI_AUTOMATION_MODEL is required.',
      code: 'OPENAI_AUTOMATION_MODEL_REQUIRED',
    });
  }

  const force = req.query?.force === '1' || req.query?.force === 'true';
  const forcePrefetch = req.query?.prefetch === '1' || req.query?.prefetch === 'true';
  const periodParam = req.query?.period ? String(req.query.period).toLowerCase() : '';
  const periods = periodParam === 'daily' || periodParam === 'weekly' ? [periodParam] : ['daily', 'weekly'];
  const now = new Date();
  const out = [];

  let prefetchResult = null;
  const prefetchDue = forcePrefetch || shouldPrefetchInstrumentResearchWindow({ now, period: 'daily', timeZone: 'Europe/London' });
  if (prefetchDue && (forcePrefetch || periods.includes('daily'))) {
    try {
      prefetchResult = await prefetchInstrumentResearchForDaily({
        runDate: now,
        timeZone: 'Europe/London',
      });
    } catch (e) {
      prefetchResult = { success: false, error: e.message || 'prefetch failed' };
    }
  }

  for (const period of periods) {
    const due = force || shouldRunWindow({ now, period, timeZone: 'Europe/London' });
    if (!due) {
      out.push({ period, skipped: true, reason: 'outside-window' });
      continue;
    }
    const outlook = await generateAndStoreOutlook({
      period,
      runDate: now,
      timeZone: 'Europe/London',
    });
    const briefSet = await generateAndStoreBriefSet({
      period,
      runDate: now,
      timeZone: 'Europe/London',
    });
    out.push({ period, outlook, briefs: briefSet });
  }

  return res.status(200).json({
    success: true,
    ranAt: now.toISOString(),
    instrumentPrefetch: prefetchResult,
    results: out,
  });
};
