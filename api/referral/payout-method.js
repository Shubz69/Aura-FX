const { verifyToken } = require('../utils/auth');
const { getPayoutMethod, setPayoutMethod } = require('./referralService');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const userId = Number(decoded.id);

  try {
    if (req.method === 'GET') {
      const data = await getPayoutMethod(userId);
      return res.status(200).json({ success: true, ...data });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      await setPayoutMethod(userId, body.method, body.details);
      const data = await getPayoutMethod(userId);
      return res.status(200).json({ success: true, ...data });
    }
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'Failed to save payout method' });
  }
};
