/**
 * Single source-of-truth for access: roles, tiers, and per-channel permissions.
 * Used by: /api/me, /api/community/channels, /api/community/channels/messages,
 * /api/community/bootstrap, AI endpoints, and WebSocket server.
 *
 * Roles: USER | ADMIN | SUPER_ADMIN (from DB role or super-admin email override)
 * Tiers: FREE | PREMIUM | ELITE (from role + subscription_plan + subscription_status)
 * Super admin by email: Shubzfx@gmail.com always gets SUPER_ADMIN role and full access (all channels, AI, pages).
 * FREE users: allowlist by channel name only (existing channels); allowedChannelSlugs = channel ids.
 */
const FREE_CHANNEL_ALLOWLIST = new Set(['general', 'welcome', 'announcements']);

/** Super admin email – always gets full access regardless of DB role */
const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';

const ACCESS_LEVELS_ELITE = new Set(['open', 'free', 'read-only', 'premium', 'a7fx', 'elite', 'support', 'staff']);
const ACCESS_LEVELS_PREMIUM = new Set(['open', 'free', 'read-only', 'premium', 'support', 'staff']);
// FREE: no access_level set; only allowlist

/**
 * Normalize DB role to API role (USER | ADMIN | SUPER_ADMIN).
 * Never expose or allow selecting Admin in signup.
 */
function normalizeRole(dbRole) {
  const r = (dbRole || '').toString().toUpperCase();
  if (r === 'SUPER_ADMIN' || r === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (r === 'ADMIN') return 'ADMIN';
  return 'USER';
}

/**
 * Compute tier from user row: FREE | PREMIUM | ELITE.
 * Super admin by email gets ELITE. ADMIN/SUPER_ADMIN get full access via role override.
 * Downgrades: effective tier is current DB state (immediate downgrade when plan/role updated).
 */
function getTier(userRow) {
  if (!userRow) return 'FREE';
  if (isSuperAdminEmail(userRow)) return 'ELITE';
  const role = (userRow.role || '').toLowerCase();
  const plan = (userRow.subscription_plan || '').toLowerCase();
  const status = (userRow.subscription_status || '').toLowerCase();
  const expiry = userRow.subscription_expiry ? new Date(userRow.subscription_expiry) : null;
  const active = status === 'active' && expiry && expiry > new Date() && !userRow.payment_failed;

  if (['admin', 'super_admin'].includes(role)) return 'ELITE';
  if (['elite', 'a7fx'].includes(role) || (active && ['a7fx', 'elite'].includes(plan))) return 'ELITE';
  if (role === 'premium' || (active && ['aura', 'premium'].includes(plan))) return 'PREMIUM';
  return 'FREE';
}

/** Effective tier for gating: same as tier (immediate downgrade model). Use this for channel/message access. */
function getEffectiveTier(userRow) {
  return getTier(userRow);
}

function isSuperAdminEmail(userRow) {
  const email = (userRow?.email || '').toString().trim().toLowerCase();
  return email === SUPER_ADMIN_EMAIL.toLowerCase();
}

/**
 * Status: none | trialing | active | expired
 */
function getStatus(userRow) {
  if (!userRow) return 'none';
  const status = (userRow.subscription_status || '').toLowerCase();
  const expiry = userRow.subscription_expiry ? new Date(userRow.subscription_expiry) : null;
  if (userRow.payment_failed) return 'expired';
  if (status === 'trialing') return 'trialing';
  if (status === 'active' && expiry && expiry > new Date()) return 'active';
  if (expiry && expiry <= new Date()) return 'expired';
  return 'none';
}

/**
 * Whether user has explicitly selected a plan (subscription_plan set). Blocks community until plan selected.
 */
function hasPlanSelected(userRow) {
  if (!userRow) return false;
  const plan = (userRow.subscription_plan || '').toString().trim().toLowerCase();
  return plan.length > 0;
}

/**
 * Entitlements from a single user row (no DB in this function).
 * canAccessCommunity: true only when plan is selected (FREE/PREMIUM/ELITE) or admin—blocks until /choose-plan.
 * Channel gating uses effectiveTier only (no stale cached tier).
 */
function getEntitlements(userRow) {
  if (!userRow) {
    return {
      role: 'USER',
      tier: 'FREE',
      effectiveTier: 'FREE',
      pendingTier: null,
      periodEnd: null,
      status: 'none',
      canAccessCommunity: false,
      canAccessAI: false,
      allowedChannelSlugs: []
    };
  }
  const role = isSuperAdminEmail(userRow) ? 'SUPER_ADMIN' : normalizeRole(userRow.role);
  const tier = getTier(userRow);
  const effectiveTier = getEffectiveTier(userRow);
  const status = getStatus(userRow);
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const planSelected = hasPlanSelected(userRow);
  const periodEnd = userRow.subscription_expiry ? new Date(userRow.subscription_expiry).toISOString() : null;

  return {
    role,
    tier,
    effectiveTier,
    pendingTier: null,
    periodEnd,
    status,
    canAccessCommunity: isAdmin || planSelected,
    canAccessAI: isAdmin || tier === 'PREMIUM' || tier === 'ELITE',
    allowedChannelSlugs: []
  };
}

/**
 * Normalize channel name for FREE allowlist match (avoid general vs general-chat).
 */
function freeChannelNameKey(name) {
  if (name == null) return '';
  return name.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '';
}

/**
 * Given entitlements and full channel list, return array of channel ids the user may see.
 * Uses effectiveTier only (never stale cached tier).
 */
function getAllowedChannelSlugs(entitlements, channels) {
  if (!entitlements || !Array.isArray(channels)) return [];
  const { role, effectiveTier } = entitlements;
  const tier = effectiveTier != null ? effectiveTier : entitlements.tier;
  const toId = (c) => (c.id != null ? String(c.id) : (c.name != null ? String(c.name) : ''));
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return channels.map(toId).filter(Boolean);
  }
  if (tier === 'FREE') {
    return channels
      .filter((c) => {
        const nameKey = freeChannelNameKey(c.name);
        const nameLower = (c.name || '').toString().toLowerCase();
        return nameKey && (FREE_CHANNEL_ALLOWLIST.has(nameKey) || FREE_CHANNEL_ALLOWLIST.has(nameLower));
      })
      .map(toId)
      .filter(Boolean);
  }
  const allowedLevels = tier === 'ELITE' ? ACCESS_LEVELS_ELITE : ACCESS_LEVELS_PREMIUM;
  return channels
    .filter((c) => {
      const level = (c.access_level || c.accessLevel || 'open').toString().toLowerCase();
      return allowedLevels.has(level);
    })
    .map(toId)
    .filter(Boolean);
}

/**
 * Per-channel permission flags. Uses effectiveTier only for gating (no stale cache).
 */
function getChannelPermissions(entitlements, channel) {
  const id = (channel?.id || channel?.name || '').toString().toLowerCase();
  const accessLevel = (channel?.access_level ?? channel?.accessLevel ?? 'open').toString().toLowerCase();
  const permissionType = (channel?.permission_type ?? channel?.permissionType ?? 'read-write').toString().toLowerCase();
  const readOnly = permissionType === 'read-only';

  const { role } = entitlements;
  const tier = entitlements.effectiveTier != null ? entitlements.effectiveTier : entitlements.tier;

  let canSee = false;
  let canRead = false;
  let canWrite = false;
  let locked = accessLevel === 'admin-only' || accessLevel === 'admin';

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    canSee = true;
    canRead = true;
    canWrite = !readOnly;
    locked = false;
    return { canSee, canRead, canWrite, locked };
  }

  if (tier === 'FREE') {
    const nameKey = freeChannelNameKey(channel?.name);
    const nameLower = (channel?.name || '').toString().toLowerCase();
    canSee = FREE_CHANNEL_ALLOWLIST.has(id) || (nameKey && FREE_CHANNEL_ALLOWLIST.has(nameKey)) || FREE_CHANNEL_ALLOWLIST.has(nameLower);
    canRead = canSee;
    canWrite = canSee && !readOnly;
    return { canSee, canRead, canWrite, locked: locked && canSee };
  }

  if (tier === 'ELITE') {
    canSee = ACCESS_LEVELS_ELITE.has(accessLevel);
  } else if (tier === 'PREMIUM') {
    canSee = ACCESS_LEVELS_PREMIUM.has(accessLevel);
  } else {
    canSee = false;
  }

  canRead = canSee;
  canWrite = canSee && !readOnly;
  if (canSee && (accessLevel === 'admin-only' || accessLevel === 'admin')) {
    locked = true;
    canWrite = false;
  }

  return { canSee, canRead, canWrite, locked };
}

/**
 * Check if user (by entitlements) is allowed to access a channel by id. Uses effectiveTier.
 */
function canAccessChannel(entitlements, channelId, channels) {
  if (!entitlements || !channelId) return false;
  const slug = channelId.toString().toLowerCase();
  if (entitlements.role === 'ADMIN' || entitlements.role === 'SUPER_ADMIN') return true;
  if (entitlements.allowedChannelSlugs && entitlements.allowedChannelSlugs.length > 0) {
    return entitlements.allowedChannelSlugs.some((s) => s.toLowerCase() === slug);
  }
  const tier = entitlements.effectiveTier != null ? entitlements.effectiveTier : entitlements.tier;
  if (tier === 'FREE') return FREE_CHANNEL_ALLOWLIST.has(slug);
  const channel = Array.isArray(channels) ? channels.find((c) => (c.id || c.name || '').toString().toLowerCase() === slug) : null;
  if (!channel) return false;
  const perm = getChannelPermissions(entitlements, channel);
  return perm.canSee;
}

module.exports = {
  FREE_CHANNEL_ALLOWLIST,
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
  normalizeRole,
  getTier,
  getEffectiveTier,
  getStatus,
  hasPlanSelected,
  getEntitlements,
  getAllowedChannelSlugs,
  getChannelPermissions,
  canAccessChannel
};
