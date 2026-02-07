/**
 * POST /api/subscription/select-free (auth required)
 * FREE plan bypasses Stripe: sets user tier to FREE in DB and returns updated entitlements.
 * Frontend should then refreshEntitlements() and navigate('/community').
 */

const { executeQuery } = require('../db');
const { generateRequestId, createLogger } = require('../utils/logger');
const { verifyToken } = require('../utils/auth');
const { invalidateEntitlementsCache } = require('../cache');

const PLAN_NAMES = { free: 'Free' };
const PLAN_PRICES = { free: { amount: 0, currency: 'GBP', interval: 'month' } };

module.exports = async (req, res) => {
  const requestId = generateRequestId('sub');
  const logger = createLogger(requestId);

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, errorCode: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', requestId });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required', requestId });
  }

  const userId = decoded.id;
  logger.info('Select FREE tier', { userId });

  try {
    const now = new Date();
    // Free tier: no Stripe, no expiry. Immediate downgrade (clear any Stripe refs).
    await executeQuery(
      `UPDATE users SET
        subscription_plan = 'free',
        subscription_status = 'active',
        subscription_expiry = NULL,
        subscription_started = COALESCE(subscription_started, NOW()),
        role = 'user',
        payment_failed = FALSE,
        onboarding_accepted = FALSE
       WHERE id = ?`,
      [userId]
    );

    const [rows] = await executeQuery(
      `SELECT id, role, subscription_plan, subscription_status, subscription_expiry, subscription_started
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, errorCode: 'USER_NOT_FOUND', message: 'User not found', requestId });
    }

    const user = rows[0];
    const subscription = {
      tier: 'FREE',
      status: 'active',
      hasCommunityAccess: true,
      planId: 'free',
      planName: PLAN_NAMES.free,
      isActive: true,
      accessType: 'NONE',
      renewsAt: null,
      trialEndsAt: null,
      canceledAt: null,
      startedAt: user.subscription_started ? new Date(user.subscription_started).toISOString() : null,
      expiresAt: null,
      daysRemaining: null,
      price: PLAN_PRICES.free,
      paymentFailed: false,
      hasUsedFreeTrial: false
    };

    logger.info('FREE tier activated', { userId, planId: 'free' });
    invalidateEntitlementsCache(userId);

    return res.status(200).json({
      success: true,
      subscription,
      requestId
    });
  } catch (error) {
    logger.error('Select FREE error', { error: error.message, userId });
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to set FREE tier. Please try again.',
      requestId
    });
  }
};
