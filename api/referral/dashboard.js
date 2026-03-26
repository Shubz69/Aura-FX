const { verifyToken } = require('../utils/auth');
const { getReferralDashboard } = require('./referralService');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const data = await getReferralDashboard(Number(decoded.id), { releaseMatured: true });
    const origin = req.headers.origin || (process.env.FRONTEND_URL || '');
    const referralUrl = data?.referralCode ? `${origin.replace(/\/$/, '')}/register?ref=${encodeURIComponent(data.referralCode)}` : null;
    return res.status(200).json({ success: true, ...data, referralUrl });
  } catch (e) {
    console.error('referral/dashboard:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};
