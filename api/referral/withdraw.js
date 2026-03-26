const { verifyToken } = require('../utils/auth');
const { requestWithdrawal } = require('./referralService');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const userId = Number(decoded.id);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  try {
    const out = await requestWithdrawal(userId, body.amountPence);
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'Withdrawal request failed' });
  }
};
