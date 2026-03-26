const { releaseMaturedPendingCommissions } = require('../referral/referralService');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  try {
    const result = await releaseMaturedPendingCommissions();
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('cron/referral-release:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to release pending commissions' });
  }
};
