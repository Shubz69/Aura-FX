const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { canAccessSurveillance } = require('../reports/resolveReportsRole');

async function assertSurveillanceEntitlement(userId, res) {
  const user = await applyScheduledDowngrade(userId);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return null;
  }
  const gateUser = {
    role: user.role,
    subscription_plan: user.subscription_plan,
    subscription_status: user.subscription_status,
    subscription_expiry: user.subscription_expiry,
    payment_failed: user.payment_failed,
  };
  if (!canAccessSurveillance(gateUser)) {
    res.status(403).json({
      success: false,
      code: 'ELITE_REQUIRED',
      message:
        'Surveillance is included with A7FX Elite only. Upgrade to Elite for live geopolitical and macro intelligence.',
    });
    return null;
  }
  return user;
}

module.exports = { assertSurveillanceEntitlement };
