/**
 * GET /api/referral/stats — referral metrics + unique code for the logged-in user.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const {
  ensureReferralSchema,
  getReferralDashboard,
} = require('./referralService');

function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
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
    await ensureReferralSchema();
    const dashboard = await getReferralDashboard(userId);
    const referralCode = dashboard?.referralCode || null;
    const legacyAtCode = `AT-${String(userId).padStart(6, '0')}`;
    const signups = Number(dashboard?.totalSignups || 0);
    const [courseR] = await executeQuery(
      `SELECT COUNT(*) AS c FROM referral_conversion
       WHERE referrer_user_id = ? AND event_type = 'course'`,
      [userId],
    );
    const coursePurchases = Number(getRows(courseR)[0]?.c ?? 0);
    const [subR] = await executeQuery(
      `SELECT COUNT(*) AS c FROM referral_conversion
       WHERE referrer_user_id = ? AND event_type = 'subscription'`,
      [userId],
    );
    const subscriptionPurchases = Number(getRows(subR)[0]?.c ?? 0);
    const totalImpact = signups + coursePurchases + subscriptionPurchases;
    const impactScore = Math.min(100, signups * 2 + subscriptionPurchases * 4 + coursePurchases * 4);
    const active = Number(dashboard?.activeReferredPlans || 0);

    return res.status(200).json({
      success: true,
      referralCode,
      legacyAtCode,
      signups,
      referrals: signups,
      coursePurchases,
      subscriptionPurchases,
      totalImpact,
      impactScore,
      statsAt: new Date().toISOString(),
      active,
      earned: 0,
      verifiedPaidReferrals: Number(dashboard?.verifiedPaidReferrals || 0),
      currentCommissionTierPercent: Number(dashboard?.currentCommissionTierPercent || 0),
      pendingEarningsPence: Number(dashboard?.pendingEarningsPence || 0),
      payableEarningsPence: Number(dashboard?.payableEarningsPence || 0),
      paidOutEarningsPence: Number(dashboard?.paidOutEarningsPence || 0),
      lifetimeEarningsPence: Number(dashboard?.lifetimeEarningsPence || 0),
      minWithdrawalPence: Number(dashboard?.minWithdrawalPence || 5000),
    });
  } catch (e) {
    console.error('referral/stats:', e.message);
    return res.status(200).json({
      success: true,
      referralCode: null,
      legacyAtCode: `AT-${String(userId).padStart(6, '0')}`,
      signups: 0,
      referrals: 0,
      coursePurchases: 0,
      subscriptionPurchases: 0,
      totalImpact: 0,
      impactScore: 0,
      statsAt: new Date().toISOString(),
      active: 0,
      earned: 0,
    });
  }
};
