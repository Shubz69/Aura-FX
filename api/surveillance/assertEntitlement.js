const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');
const { canAccessSurveillance } = require('../reports/resolveReportsRole');
const { buildSurveillanceGateUser } = require('../utils/entitlements');

async function assertSurveillanceEntitlement(userId, res) {
  const user = await applyScheduledDowngrade(userId);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return null;
  }
  const gateUser = buildSurveillanceGateUser(user);
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
