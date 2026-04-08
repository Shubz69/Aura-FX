const { verifyToken } = require('../utils/auth');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');

/**
 * Lightweight compatibility endpoint for legacy passport checks.
 * Keeps old clients from failing while newer clients use Trader DNA APIs.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });

  try {
    const user = await applyScheduledDowngrade(Number(decoded.id));
    const role = String(user?.subscription_status || user?.plan || 'free').toLowerCase();
    const isEligible = ['premium', 'aura', 'elite', 'a7fx'].includes(role);
    return res.status(200).json({
      success: true,
      eligible: isEligible,
      tier: role,
      source: 'compat',
    });
  } catch (e) {
    return res.status(200).json({
      success: true,
      eligible: false,
      tier: 'unknown',
      source: 'compat',
    });
  }
};

