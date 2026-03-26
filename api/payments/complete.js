/**
 * POST /api/payments/complete — course purchase completion (client); records referral conversion.
 * Body: { courseId?, sessionId?, timestamp? }
 */

const { verifyToken } = require('../utils/auth');
const { recordReferralConversion } = require('../referral/referralService');

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body.toString();
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = Number(decoded.id);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    const body = parseBody(req);
    const grossAmountPence = Math.max(
      0,
      Math.round(
        Number(body.amountPence ?? body.amount_pence ?? body.amount ?? body.totalPence ?? 0)
      )
    );
    await recordReferralConversion(userId, 'course', {
      sourceTable: 'payments_complete',
      sourceId: String(body.sessionId || body.paymentIntentId || body.courseId || `course:${userId}:${Date.now()}`),
      grossAmountPence,
      netAmountPence: grossAmountPence,
      currency: String(body.currency || 'GBP').toUpperCase(),
      metadata: {
        courseId: body.courseId || null,
        sessionId: body.sessionId || null,
      },
    });
  } catch (e) {
    console.warn('payments/complete referral:', e.message);
  }


  return res.status(200).json({
    success: true,
    message: 'Payment completion recorded',
  });
};
