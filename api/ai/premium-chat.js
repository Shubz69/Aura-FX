const { getDbConnection } = require('../db');
const { verifyTokenOrLegacy } = require('../utils/auth');
const { getEntitlements } = require('../utils/entitlements');
const { generateResponse } = require('./chat-core');

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = async (req, res) => {
  const requestId = generateRequestId();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed', requestId });
  }

  if (!String(process.env.PERPLEXITY_API_KEY || '').trim()) {
    return res.status(500).json({
      success: false,
      message: 'AI service is not configured.',
      requestId,
    });
  }

  const decoded = verifyTokenOrLegacy(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized', requestId });
  }

  let db;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection error', requestId });
    }

    const [userRows] = await db.execute(
      `SELECT id, email, role, subscription_status, subscription_plan, subscription_expiry, payment_failed
       FROM users WHERE id = ?`,
      [decoded.id]
    );

    if (!userRows?.length) {
      return res.status(404).json({ success: false, message: 'User not found', requestId });
    }

    const user = userRows[0];
    const entitlements = getEntitlements(user);
    if (!entitlements.canAccessAI) {
      return res.status(403).json({
        success: false,
        message: 'Premium subscription required. Please upgrade to access the AI assistant.',
        requestId,
      });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const message = typeof body.message === 'string' ? body.message : '';
    const images = Array.isArray(body.images) ? body.images : [];
    const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];

    if (!message.trim() && images.length === 0) {
      return res.status(400).json({ success: false, message: 'Message or image is required', requestId });
    }

    const result = await generateResponse({
      message,
      images,
      conversationHistory,
      user,
      requestId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[premium-chat] error', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to process AI request',
      requestId,
    });
  } finally {
    if (db?.release) {
      try {
        db.release();
      } catch (_) {
        // ignore release errors
      }
    }
  }
};
