/**
 * GET /api/me
 * Single source-of-truth: returns user.role + entitlements.
 * Frontend must render channels/features ONLY from these; never guess access.
 */

const { executeQuery } = require('./db');
const {
  getEntitlements,
  getAllowedChannelSlugs,
  normalizeRole
} = require('./utils/entitlements');

function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const userId = decoded.id;

  try {
    const [userRows] = await executeQuery(
      `SELECT id, email, username, name, avatar, role,
              subscription_status, subscription_plan, subscription_expiry,
              subscription_started, payment_failed, has_used_free_trial
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({
        success: false,
        errorCode: 'USER_NOT_FOUND',
        message: 'User not found'
      });
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

    const user = {
      id: userRow.id,
      email: userRow.email,
      username: userRow.username || userRow.email?.split('@')[0] || '',
      name: userRow.name || userRow.username || '',
      avatar: userRow.avatar || '/avatars/avatar_ai.png',
      role: normalizeRole(userRow.role)
    };

    return res.status(200).json({
      success: true,
      user,
      entitlements: {
        tier: entitlements.tier,
        status: entitlements.status,
        canAccessCommunity: entitlements.canAccessCommunity,
        canAccessAI: entitlements.canAccessAI,
        allowedChannelSlugs: entitlements.allowedChannelSlugs
      }
    });
  } catch (error) {
    console.error('Error in /api/me:', error);
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to load user'
    });
  }
};
