/**
 * GET /api/system/metrics — in-process counters (server-side).
 * Non-production open; production requires SYSTEM_METRICS_SECRET + x-system-metrics-secret.
 */

const { getSnapshot } = require('../utils/systemMetrics');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-system-metrics-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const expected = process.env.SYSTEM_METRICS_SECRET || '';
  const given = req.headers['x-system-metrics-secret'] || '';
  if (isProd && (!expected || given !== expected)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden',
      errorCode: 'SYSTEM_ERROR',
    });
  }

  return res.status(200).json({
    success: true,
    serverMetrics: getSnapshot(),
    note: 'Client calculator counters (calculations_run/blocked) are tracked in the browser bundle only.',
  });
};
