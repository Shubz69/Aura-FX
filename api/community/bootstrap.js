/**
 * GET /api/community/bootstrap?channelSlug=...
 * One response: entitlements + allowed channels (with canSee/canRead/canWrite/locked) + last 30 messages for channelSlug.
 * Reduces round trips for 3-phase boot: render from cache → this → enable WS.
 */

const { getDbConnection } = require('../../db');
const { getEntitlements, getChannelPermissions, getAllowedChannelSlugs } = require('../../utils/entitlements');

function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const channelSlug = (req.query.channelSlug || req.query.channelId || '').toString().trim();

  try {
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database unavailable' });
    }

    try {
      const [userRows] = await db.execute(
        'SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed, onboarding_accepted, onboarding_subscription_snapshot FROM users WHERE id = ?',
        [decoded.id]
      );
      if (!userRows || userRows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const entitlements = getEntitlements(userRows[0]);

      let channels = [];
      const [channelRows] = await db.execute(
        'SELECT id, name, category, description, access_level, permission_type FROM channels ORDER BY COALESCE(category, \'general\'), name'
      );
      if (channelRows && channelRows.length > 0) {
        const allChannels = channelRows.map((row) => {
          const displayName = (row.name || '')
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          return {
            id: row.id,
            name: row.name,
            displayName,
            category: row.category || 'general',
            description: row.description,
            accessLevel: row.access_level || 'open',
            permissionType: row.permission_type || 'read-write'
          };
        });
        entitlements.allowedChannelSlugs = getAllowedChannelSlugs(entitlements, allChannels);
        channels = allChannels.map((ch) => {
          const perm = getChannelPermissions(entitlements, {
            id: ch.id,
            name: ch.name,
            access_level: ch.accessLevel,
            permission_type: ch.permissionType
          });
          return { ...ch, canSee: perm.canSee, canRead: perm.canRead, canWrite: perm.canWrite, locked: perm.locked };
        });
      }

      let messages = [];
      if (channelSlug) {
        const perm = channels.find((c) => (c.id || '').toString() === channelSlug || (c.name || '').toString() === channelSlug);
        if (perm && perm.canRead) {
          const [msgRows] = await db.execute(
            `SELECT m.*, u.username, u.name, u.avatar, u.role 
             FROM messages m 
             LEFT JOIN users u ON m.sender_id = u.id 
             WHERE m.channel_id = ? 
             ORDER BY m.timestamp DESC 
             LIMIT 30`,
            [channelSlug]
          );
          if (msgRows && msgRows.length > 0) {
            messages = msgRows.reverse();
          }
        }
      }

      return res.status(200).json({
        success: true,
        entitlements: {
          tier: entitlements.tier,
          status: entitlements.status,
          canAccessCommunity: entitlements.canAccessCommunity,
          canAccessAI: entitlements.canAccessAI,
          allowedChannelSlugs: entitlements.allowedChannelSlugs,
          onboardingAccepted: entitlements.onboardingAccepted,
          needsOnboardingReaccept: entitlements.needsOnboardingReaccept
        },
        channels,
        messages
      });
    } finally {
      try {
        db.release && db.release();
      } catch (e) {
        // ignore
      }
    }
  } catch (error) {
    console.error('Bootstrap error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load bootstrap' });
  }
};
