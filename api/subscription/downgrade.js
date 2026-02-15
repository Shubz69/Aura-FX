/**
 * POST /api/subscription/downgrade (auth required)
 * Downgrade to a lower plan: either immediately (no refund) or at period end.
 * Body: { targetPlanId: 'free' | 'aura', when: 'now' | 'period_end' }
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { invalidateEntitlementsCache } = require('../cache');
const { ensureDowngradeColumns } = require('../utils/apply-scheduled-downgrade');

const PLAN_ORDER = { free: 0, aura: 1, a7fx: 2 };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, errorCode: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const userId = decoded.id;
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const targetPlanId = (body.targetPlanId || '').toString().toLowerCase();
  const when = (body.when || '').toString().toLowerCase();

  if (!['free', 'aura'].includes(targetPlanId)) {
    return res.status(400).json({ success: false, message: 'Invalid targetPlanId. Use "free" or "aura".' });
  }
  if (!['now', 'period_end'].includes(when)) {
    return res.status(400).json({ success: false, message: 'Invalid when. Use "now" or "period_end".' });
  }

  try {
    await ensureDowngradeColumns();

    const [rows] = await executeQuery(
      'SELECT id, subscription_plan, subscription_status, subscription_expiry, cancel_at_period_end, downgrade_to_plan FROM users WHERE id = ?',
      [userId]
    );
    const user = rows && rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentPlan = (user.subscription_plan || '').toString().toLowerCase();
    if (!currentPlan || currentPlan === 'free') {
      return res.status(400).json({ success: false, message: 'No active paid subscription to downgrade.' });
    }

    const currentLevel = PLAN_ORDER[currentPlan] ?? 0;
    const targetLevel = PLAN_ORDER[targetPlanId] ?? 0;
    if (targetLevel >= currentLevel) {
      return res.status(400).json({ success: false, message: 'Target plan must be lower than your current plan.' });
    }

    if (when === 'now') {
      const newRole = targetPlanId === 'free' ? 'user' : 'premium';
      await executeQuery(
        `UPDATE users SET
           subscription_plan = ?,
           role = ?,
           subscription_status = 'inactive',
           subscription_expiry = NULL,
           cancel_at_period_end = FALSE,
           downgrade_to_plan = NULL,
           onboarding_accepted = FALSE
         WHERE id = ?`,
        [targetPlanId, newRole, userId]
      );
      invalidateEntitlementsCache(userId);
      return res.status(200).json({
        success: true,
        message: 'Subscription changed immediately. You now have access for the plan you switched to. No refunds are given for the unused period.',
        subscription: { planId: targetPlanId, applied: 'now' }
      });
    }

    if (when === 'period_end') {
      await executeQuery(
        `UPDATE users SET cancel_at_period_end = TRUE, downgrade_to_plan = ? WHERE id = ?`,
        [targetPlanId, userId]
      );
      invalidateEntitlementsCache(userId);
      return res.status(200).json({
        success: true,
        message: 'Your subscription will switch to ' + (targetPlanId === 'free' ? 'Free' : 'Aura FX') + ' at the end of your current period. You keep your current access until then.',
        subscription: { planId: currentPlan, downgradeToPlanId: targetPlanId, atPeriodEnd: true }
      });
    }
  } catch (err) {
    console.error('Subscription downgrade error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to process downgrade. Please try again.'
    });
  }
};
