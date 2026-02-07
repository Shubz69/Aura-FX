/**
 * GET /api/me
 * Single source-of-truth: returns user.role + entitlements.
 * Frontend must render channels/features ONLY from these; never guess access.
 *
 * PERFORMANCE: Entitlements cached 60s per userId. Invalidated on tier/role change.
 */

const { executeQuery } = require('./db');
const { getEntitlements, getAllowedChannelSlugs } = require('./utils/entitlements');
const { verifyToken } = require('./utils/auth');
const { getOrFetch } = require('./cache');

const ENTITLEMENTS_TTL = 60000; // 60s - low latency, fresh enough for tier changes

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Prevent server/CDN caching so post-payment access updates immediately
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const userId = decoded.id;

  try {
    const fetchEntitlements = async () => {
      let userRows;
      try {
        [userRows] = await executeQuery(
        `SELECT id, email, username, name, avatar, role,
                subscription_status, subscription_plan, subscription_expiry,
                subscription_started, payment_failed, has_used_free_trial,
                onboarding_accepted, onboarding_subscription_snapshot,
                level, xp
         FROM users WHERE id = ?`,
        [userId]
      );
    } catch (colErr) {
      // Columns may not exist if migration not run - fallback to basic query
      if (colErr.code === 'ER_BAD_FIELD_ERROR' || (colErr.message && colErr.message.includes('Unknown column'))) {
        const [fallbackRows] = await executeQuery(
          `SELECT id, email, username, name, avatar, role,
                  subscription_status, subscription_plan, subscription_expiry,
                  subscription_started, payment_failed, has_used_free_trial
           FROM users WHERE id = ?`,
          [userId]
        );
        userRows = (fallbackRows || []).map((r) => ({
          ...r,
          onboarding_accepted: false,
          onboarding_subscription_snapshot: null,
          level: r.level != null ? r.level : 1,
          xp: r.xp != null ? r.xp : 0
        }));
      } else {
        throw colErr;
      }
    }

    if (!userRows || userRows.length === 0) {
      throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
    }

    const userRow = userRows[0];
    const entitlements = getEntitlements(userRow);

    let channels = [];
    try {
      const [channelRows] = await executeQuery(
        `SELECT id, name, category, description, access_level, permission_type
         FROM channels ORDER BY COALESCE(category, 'general'), name`
      );
      if (channelRows && channelRows.length > 0) {
        channels = channelRows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description,
          access_level: r.access_level,
          permission_type: r.permission_type
        }));
      }
    } catch (e) {
      // channels table may not exist yet
    }

    entitlements.allowedChannelSlugs = getAllowedChannelSlugs(entitlements, channels);

      const updatedAt = Date.now();
      entitlements.updatedAt = updatedAt;
      entitlements.version = String(updatedAt);

      // user.role must match entitlements.role (super admin by email → SUPER_ADMIN)
      const user = {
          id: userRow.id,
        email: userRow.email,
        username: userRow.username || userRow.email?.split('@')[0] || '',
        name: userRow.name || userRow.username || '',
        avatar: userRow.avatar || '/avatars/avatar_ai.png',
        role: entitlements.role,
        level: userRow.level != null ? parseInt(userRow.level, 10) : 1,
        xp: userRow.xp != null ? parseFloat(userRow.xp) : 0
      };

      return { user, entitlements };
    };

    const cacheKey = `entitlements:${userId}`;
    const { user, entitlements: ent } = await getOrFetch(cacheKey, fetchEntitlements, ENTITLEMENTS_TTL);

    return res.status(200).json({
      success: true,
      user,
      entitlements: {
        tier: ent.tier,
        status: ent.status,
        periodEnd: ent.periodEnd ?? null,
        pendingTier: ent.pendingTier ?? null,
        effectiveTier: ent.effectiveTier ?? ent.tier,
        canAccessCommunity: ent.canAccessCommunity,
        canAccessAI: ent.canAccessAI,
        allowedChannelSlugs: ent.allowedChannelSlugs,
        onboardingAccepted: ent.onboardingAccepted,
        needsOnboardingReaccept: ent.needsOnboardingReaccept,
        updatedAt: ent.updatedAt,
        version: ent.version
      }
    });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        errorCode: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }
    console.error('Error in /api/me:', error);
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to load user'
    });
  }
};
