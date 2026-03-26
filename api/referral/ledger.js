const { verifyToken } = require('../utils/auth');
const { getReferralLedger } = require('./referralService');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const page = Number(req.query?.page || 1);
  const pageSize = Number(req.query?.pageSize || 20);
  try {
    const items = await getReferralLedger(Number(decoded.id), page, pageSize);
    return res.status(200).json({ success: true, page, pageSize, items });
  } catch (e) {
    console.error('referral/ledger:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to load ledger' });
  }
};
