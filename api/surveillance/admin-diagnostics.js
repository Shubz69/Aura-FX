const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { ensureSurveillanceSchema } = require('./schema');
const { getSystemHealthSummary } = require('./adapterState');

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);

  try {
    await ensureSurveillanceSchema();
    const [urows] = await executeQuery(`SELECT id, email, role FROM users WHERE id = ? LIMIT 1`, [userId]);
    const user = urows && urows[0];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const role = (user.role || '').toLowerCase();
    const allowed = role === 'admin' || role === 'super_admin' || isSuperAdminEmail(user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const limit = Math.min(80, Math.max(5, Number(req.query?.limit) || 40));
    const [adapterRows] = await executeQuery(`SELECT * FROM surveillance_adapter_state ORDER BY adapter_id ASC`, []);
    const [runs] = await executeQuery(
      `SELECT id, adapter_id, started_at, finished_at, items_in, items_out, error_code, duration_ms
       FROM surveillance_ingest_runs
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    const [storyCount] = await executeQuery(`SELECT COUNT(*) AS c FROM surveillance_stories`, []);
    const stories = storyCount && storyCount[0] ? Number(storyCount[0].c) : 0;
    const systemHealth = await getSystemHealthSummary();

    const diagnosticsBrief = {
      adapterCount: systemHealth.adapterCount,
      totalEvents: systemHealth.totalEvents,
      recencyBuckets: systemHealth.adapterRecencyBuckets,
      failureStreaks: systemHealth.failureStreakSummary,
      ingestQuality: systemHealth.ingestQualitySummary,
      weakFamilies: (systemHealth.underperformingFamilies || []).slice(0, 8),
      feedMix24h: systemHealth.feedMix24h,
      regionCoverage: systemHealth.regionCoverage,
      aviationMaritimeHealth: systemHealth.aviationMaritimeHealth,
      coverageHonesty: systemHealth.coverageHonesty,
      lastIngestSuccessAt: systemHealth.lastIngestSuccessAt,
      degraded: systemHealth.degraded,
    };

    return res.status(200).json({
      success: true,
      diagnosticsBrief,
      systemHealth,
      adapterState: adapterRows || [],
      storyTableRows: stories,
      recentIngestRuns: runs || [],
    });
  } catch (e) {
    console.error('[surveillance/admin-diagnostics]', e);
    return res.status(500).json({ success: false, message: 'Diagnostics failed' });
  }
};
