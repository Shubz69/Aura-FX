/**
 * Cron Job: Weekly Signup Report
 * 
 * This endpoint is called by Vercel Cron (configured in vercel.json)
 * to send a weekly email report of all signups from the past week.
 * 
 * Schedule: Every Sunday at midnight UTC (configured in vercel.json crons array)
 * 
 * NOTE: Do NOT add cron schedule parsing in this JS file.
 * Cron scheduling is handled by Vercel's cron system, not Node.js.
 */

const { executeQuery } = require('../db');
const { sendWeeklySignupReport } = require('../utils/email');

module.exports = async (req, res) => {
  // Verify cron secret or allow from Vercel Cron
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();

  const isVercelCronHeader = req.headers['x-vercel-cron'] === '1';
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isVercelCronUA = userAgent.includes('vercel-cron');

  const allowed = isVercelCronHeader || hasValidSecret || (isVercelCronUA && process.env.VERCEL);

  if (!allowed && process.env.NODE_ENV === 'production') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Set CRON_SECRET in Vercel env vars for secure cron auth.'
    });
  }

  try {
    // Calculate date range: last 7 days (past week)
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    // Format dates for MySQL
    const weekAgoStr = weekAgo.toISOString().slice(0, 19).replace('T', ' ');
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

    // Fetch all users who signed up in the past week with their subscription info
    const [rows] = await executeQuery(
      `SELECT 
        id,
        username,
        email,
        name,
        subscription_plan,
        created_at
       FROM users 
       WHERE created_at >= ? AND created_at <= ?
       ORDER BY created_at DESC`,
      [weekAgoStr, nowStr]
    );

    const signups = rows || [];

    // Send email report
    const emailResult = await sendWeeklySignupReport({ signups });

    return res.status(200).json({
      success: true,
      message: 'Weekly signup report sent',
      signupsCount: signups.length,
      dateRange: {
        from: weekAgoStr,
        to: nowStr
      },
      emailSent: emailResult.sent,
      emailError: emailResult.reason || null
    });
  } catch (error) {
    console.error('Weekly signup report cron error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate weekly signup report',
      error: error.message
    });
  }
};
