/**
 * Cron Job: Automated Daily/Weekly market briefs.
 * Daily: 06:00 UK (Europe/London)
 * Weekly: Sunday 18:00 UK (Europe/London)
 */
const { generateAndStoreOutlook, generateAndStoreBrief, shouldRunWindow } = require('../trader-deck/services/autoBriefGenerator');

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
  const periodParam = req.query?.period ? String(req.query.period).toLowerCase() : '';
  const periods = periodParam === 'daily' || periodParam === 'weekly' ? [periodParam] : ['daily', 'weekly'];
  const now = new Date();
  const out = [];

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
    const brief = await generateAndStoreBrief({
      period,
      runDate: now,
      timeZone: 'Europe/London',
    });
    out.push({ period, outlook, brief });
  }

  return res.status(200).json({
    success: true,
    ranAt: now.toISOString(),
    results: out,
  });
};
