/**
 * GET /api/admin/trader-desk-automation-status
 * Last Trader Desk automation runs (briefs / outlook) and category coverage — admin only.
 */

'use strict';

const { executeQuery } = require('../db');
const { assertStaffAdminFromRequest } = require('../utils/adminAccess');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const admin = await assertStaffAdminFromRequest(req);
  if (!admin.ok) return res.status(admin.status).json({ success: false, message: admin.message });

  try {
    const [runs] = await executeQuery(
      `SELECT run_key, period, brief_date, status, brief_id, error_message, updated_at
       FROM trader_deck_brief_runs
       ORDER BY updated_at DESC
       LIMIT 60`
    );
    const [dailyOutlook] = await executeQuery(
      `SELECT run_key, status, updated_at, error_message
       FROM trader_deck_brief_runs
       WHERE run_key LIKE 'auto-outlook:daily:%' AND status = 'success'
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    const [coverage] = await executeQuery(
      `SELECT date, period, COUNT(DISTINCT brief_kind) AS kinds
       FROM trader_deck_briefs
       WHERE period IN ('daily','weekly')
         AND date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
         AND COALESCE(LOWER(brief_kind), '') <> 'general'
       GROUP BY date, period
       ORDER BY date DESC, period ASC
       LIMIT 28`
    );
    return res.status(200).json({
      success: true,
      lastDailyOutlookSuccess: dailyOutlook[0] || null,
      recentRuns: runs || [],
      briefKindCoverageByDate: coverage || [],
    });
  } catch (e) {
    console.error('[admin/trader-desk-automation-status]', e);
    return res.status(500).json({ success: false, message: e.message || 'query failed' });
  }
};
