/**
 * Cron Job: Automated Daily/Weekly market briefs.
 * Daily: 00:00 Europe/London every calendar day — outlook + 8 category briefs + Aura FX institutional daily brief.
 * Daily prefetch: ~22:00 UK — per-instrument Perplexity research layer stored for the next day’s briefs.
 * Weekly: Sunday 18:00 UK — 8 category briefs + institutional weekly brief (week-ending storage key).
 */
const {
  generateAndStoreOutlook,
  generateAndStoreBriefSet,
  generateAndStoreMissingCategoryBriefs,
  generateAndStoreInstitutionalBriefOnly,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldPrefetchInstrumentResearchWindow,
  isTraderDeskAutomationConfigured,
} = require('../trader-deck/services/autoBriefGenerator');
const { resetProviderRequestMeter, logProviderRequestMeter } = require('../utils/providerRequestMeter');
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

const handler = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!isAuthorized(req) && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!isTraderDeskAutomationConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Automation blocked: PERPLEXITY_API_KEY is required.',
      code: 'PERPLEXITY_API_KEY_REQUIRED',
    });
  }

  const payload = await runTwelveDataCronWork(async () => {
    resetProviderRequestMeter();

    const force = req.query?.force === '1' || req.query?.force === 'true';
    const forcePrefetch = req.query?.prefetch === '1' || req.query?.prefetch === 'true';
    const periodParam = req.query?.period ? String(req.query.period).toLowerCase() : '';
    const periods = periodParam === 'daily' || periodParam === 'weekly' ? [periodParam] : ['daily', 'weekly'];
    const now = new Date();
    const out = [];

    let prefetchResult = null;
    const prefetchDue =
      forcePrefetch || shouldPrefetchInstrumentResearchWindow({ now, period: 'daily', timeZone: 'Europe/London' });
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
      logProviderRequestMeter('[cron-auto-market-briefs] cumulative outbound HTTP after outlook', { period });
      const categoryBriefs = await generateAndStoreBriefSet({
        period,
        runDate: now,
        timeZone: 'Europe/London',
      });
      const categoryGapFill = await generateAndStoreMissingCategoryBriefs({
        period,
        runDate: now,
        timeZone: 'Europe/London',
      });
      logProviderRequestMeter('[cron-auto-market-briefs] cumulative outbound HTTP after category brief set', { period });
      const institutional = await generateAndStoreInstitutionalBriefOnly({
        period,
        runDate: now,
        timeZone: 'Europe/London',
      });
      logProviderRequestMeter('[cron-auto-market-briefs] cumulative outbound HTTP after institutional brief', { period });
      out.push({ period, outlook, categoryBriefs, categoryGapFill, institutional });
    }

    logProviderRequestMeter('[cron-auto-market-briefs] invocation total outbound HTTP (since cron start)');

    return {
      success: true,
      ranAt: now.toISOString(),
      instrumentPrefetch: prefetchResult,
      results: out,
    };
  });

  return res.status(200).json(payload);
};

/** Vercel: allow long-running automation (matches vercel.json `api/cron/*.js`). */
handler.config = {
  maxDuration: 300,
};

module.exports = handler;
