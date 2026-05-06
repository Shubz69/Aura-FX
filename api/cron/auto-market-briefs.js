/**
 * Cron Job: Automated Daily/Weekly market briefs.
 * Daily: Mon–Sat 00:00 Europe/London — outlook + eight canonical category briefs (PDF pipeline).
 * Weekly: Monday 00:00 UK — eight weekly fundamental briefs (week-ending storage key).
 * Sunday Market Open: London Sunday ~21:00 (env SUNDAY_OPEN_BRIEF_HOUR_LONDON) — single aura_sunday_market_open brief.
 *
 * One-shot repair (same auth as cron — Bearer CRON_SECRET or Vercel cron headers):
 *   GET /api/cron/auto-market-briefs?backfill=1
 *   Optional: &from=YYYY-MM-DD&to=YYYY-MM-DD (London calendar; default from = latest Sunday ≤ today, to = today).
 *   At most 14 London days per request to limit runtime and LLM spend.
 */
const { DateTime } = require('luxon');
const {
  generateAndStoreOutlook,
  generateAndStoreInstitutionalBriefOnly,
  generateAndStoreSundayMarketOpenBriefOnly,
  prefetchInstrumentResearchForDaily,
  shouldRunWindow,
  shouldRunIntelPackCatchUp,
  shouldPrefetchInstrumentResearchWindow,
  shouldRunSundayMarketOpenWindow,
  isTraderDeskAutomationConfigured,
} = require('../trader-deck/services/autoBriefGenerator');
const { resetProviderRequestMeter, logProviderRequestMeter } = require('../utils/providerRequestMeter');
const { runTwelveDataCronWork } = require('./twelveDataCronContext');

function isSundayLondon(now, timeZone = 'Europe/London') {
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(now);
  return String(wd).toLowerCase().startsWith('sun');
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

  const backfill = req.query?.backfill === '1' || req.query?.backfill === 'true';
  if (backfill) {
    const payload = await runTwelveDataCronWork(async () => {
      resetProviderRequestMeter();
      const tz = 'Europe/London';
      const nowLon = DateTime.now().setZone(tz);
      let fromStr = String(req.query?.from || '').trim().slice(0, 10);
      let toStr = String(req.query?.to || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
        let d = nowLon.startOf('day');
        while (d.weekday !== 7) d = d.minus({ days: 1 });
        fromStr = d.toISODate();
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) toStr = nowLon.toISODate();
      let start = DateTime.fromISO(fromStr, { zone: tz }).startOf('day');
      let end = DateTime.fromISO(toStr, { zone: tz }).startOf('day');
      if (!start.isValid || !end.isValid) {
        return { success: false, message: 'Invalid from/to — use YYYY-MM-DD (Europe/London calendar).' };
      }
      if (end < start) {
        const t = start;
        start = end;
        end = t;
      }
      const MAX_DAYS = 14;
      const spanDays = Math.floor(end.diff(start, 'days').days) + 1;
      if (spanDays > MAX_DAYS) {
        start = end.minus({ days: MAX_DAYS - 1 });
      }
      const results = [];
      for (let d = start; d <= end; d = d.plus({ days: 1 })) {
        const ymd = d.toISODate();
        const runDate = DateTime.fromISO(`${ymd}T06:30:00`, { zone: tz }).toJSDate();
        const wd = d.weekday;
        if (wd === 7) {
          let sundayMarketOpen;
          try {
            sundayMarketOpen = await generateAndStoreSundayMarketOpenBriefOnly({
              runDate,
              timeZone: tz,
            });
          } catch (e) {
            sundayMarketOpen = { success: false, error: e.message || 'sunday market open brief failed' };
          }
          results.push({ ymd, slice: 'sunday_open', sundayMarketOpen });
        } else {
          let outlook;
          let categoryIntelPack;
          try {
            outlook = await generateAndStoreOutlook({
              period: 'daily',
              runDate,
              timeZone: tz,
            });
          } catch (e) {
            outlook = { success: false, error: e.message || 'outlook failed' };
          }
          try {
            categoryIntelPack = await generateAndStoreInstitutionalBriefOnly({
              period: 'daily',
              runDate,
              timeZone: tz,
            });
          } catch (e) {
            categoryIntelPack = { success: false, error: e.message || 'intel pack failed' };
          }
          results.push({ ymd, slice: 'daily', outlook, categoryIntelPack });
        }
        logProviderRequestMeter(`[cron-auto-market-briefs] backfill day ${ymd}`);
      }
      logProviderRequestMeter('[cron-auto-market-briefs] backfill invocation total outbound HTTP');
      return {
        success: true,
        backfill: true,
        from: start.toISODate(),
        to: end.toISODate(),
        results,
      };
    });
    return res.status(200).json(payload);
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

    let sundayMarketOpen = null;
    const sundayOpenDue =
      shouldRunSundayMarketOpenWindow({ now, timeZone: 'Europe/London' }) ||
      req.query?.sundayOpen === '1' ||
      (force && isSundayLondon(now, 'Europe/London'));
    if (sundayOpenDue) {
      try {
        sundayMarketOpen = await generateAndStoreSundayMarketOpenBriefOnly({
          runDate: now,
          timeZone: 'Europe/London',
        });
      } catch (e) {
        sundayMarketOpen = { success: false, error: e.message || 'sunday market open brief failed' };
      }
      logProviderRequestMeter('[cron-auto-market-briefs] cumulative outbound HTTP after sunday market open brief');
    }

    for (const period of periods) {
      const tz = 'Europe/London';
      const inPrimaryWindow = shouldRunWindow({ now, period, timeZone: tz });
      const inCatchUp = await shouldRunIntelPackCatchUp({ now, period, timeZone: tz });
      const due = force || inPrimaryWindow || inCatchUp;
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
      const categoryIntelPack = await generateAndStoreInstitutionalBriefOnly({
        period,
        runDate: now,
        timeZone: 'Europe/London',
      });
      logProviderRequestMeter('[cron-auto-market-briefs] cumulative outbound HTTP after category intel pack', { period });
      out.push({ period, outlook, categoryIntelPack });
    }

    logProviderRequestMeter('[cron-auto-market-briefs] invocation total outbound HTTP (since cron start)');

    return {
      success: true,
      ranAt: now.toISOString(),
      instrumentPrefetch: prefetchResult,
      sundayMarketOpen,
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
