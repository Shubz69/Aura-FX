/**
 * Single source-of-truth for access: roles, tiers, and per-channel permissions.
 * Used by: /api/me, /api/community/channels, /api/community/channels/messages,
 * /api/community/bootstrap, AI endpoints, and WebSocket server.
 *
 * Channel access is decided ONLY by: (1) user role + tier (entitlements), (2) channel access_level
 * and permission_type. Category is NEVER used for access—only for grouping in the sidebar.
 *
 * ROLES (from DB): USER | ADMIN | SUPER_ADMIN
 * TIERS (from entitlements/subscription): FREE | PREMIUM | ELITE
 *
 * RULES:
 * 1) Admin override: role ADMIN or SUPER_ADMIN → canSee/canRead true for all; canWrite true unless read-only.
 * 2) FREE (role USER): hard allowlist—only channel ids general, welcome, announcements. All others canSee=false.
 * 3) PREMIUM (role USER): canSee where access_level in open, free, read-only, premium, support, staff. Not a7fx/elite/admin-only.
 * 4) ELITE (role USER): same as PREMIUM plus access_level a7fx, elite. Still no admin-only unless admin role.
 * 5) Write: canWrite = false if permission_type === 'read-only' OR access_level === 'read-only'; else true when canSee.
 */
const FREE_CHANNEL_ALLOWLIST = new Set(['general', 'welcome', 'announcements', 'levels', 'notifications']);

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
  if (active && plan === 'a7fx') return 'A7FX';
  if (['elite', 'a7fx'].includes(role) || (active && plan === 'elite')) return 'ELITE';
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

function needsOnboardingReaccept(userRow) {
  if (!userRow) return true;
  if (isSuperAdminEmail(userRow)) return false;
  const accepted = userRow.onboarding_accepted === true || userRow.onboarding_accepted === 1;
  if (!accepted) return true;
  const snapshot = (userRow.onboarding_subscription_snapshot || '').toString().toLowerCase();
  const tier = getTier(userRow);
  if (tier === 'ELITE' && !['elite', 'a7fx', 'admin', 'super_admin'].includes(snapshot)) return true;
  if (tier === 'A7FX' && !['a7fx', 'admin', 'super_admin'].includes(snapshot)) return true;
  if (tier === 'PREMIUM' && !['premium', 'aura', 'elite', 'a7fx', 'admin', 'super_admin'].includes(snapshot)) return true;
  if (tier === 'FREE' && !['free', 'open', ''].includes(snapshot)) return true;
  const current = (userRow.subscription_plan || userRow.role || 'free').toString().toLowerCase();
  return snapshot !== current;
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
      allowedChannelSlugs: [],
      onboardingAccepted: false,
      needsOnboardingReaccept: true
    };
  }
  const role = isSuperAdminEmail(userRow) ? 'SUPER_ADMIN' : normalizeRole(userRow.role);
  const tier = getTier(userRow);
  const effectiveTier = getEffectiveTier(userRow);
  const status = getStatus(userRow);
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const planSelected = hasPlanSelected(userRow);
  const periodEnd = userRow.subscription_expiry ? new Date(userRow.subscription_expiry).toISOString() : null;
  const onboardingAccepted = isAdmin || (userRow.onboarding_accepted === true || userRow.onboarding_accepted === 1);
  const needsReaccept = !isAdmin && needsOnboardingReaccept(userRow);

  const isSuperAdminUser = isSuperAdminEmail(userRow);
  return {
    role,
    tier,
    effectiveTier,
    pendingTier: null,
    periodEnd,
    status,
    canAccessCommunity: isAdmin || planSelected,
    canAccessAI: isAdmin || tier === 'PREMIUM' || tier === 'ELITE' || tier === 'A7FX',
    allowedChannelSlugs: [],
    onboardingAccepted: isAdmin || onboardingAccepted,
    needsOnboardingReaccept: needsReaccept,
    isSuperAdminUser
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
 * If !onboardingAccepted or needsOnboardingReaccept, only 'welcome' is allowed.
 * welcome and announcements are ALWAYS visible to all users (no tier restriction).
 */
function getAllowedChannelSlugs(entitlements, channels) {
  if (!entitlements || !Array.isArray(channels)) return [];
  const { role, effectiveTier, onboardingAccepted, needsOnboardingReaccept } = entitlements;
  const toId = (c) => (c.id != null ? String(c.id) : (c.name != null ? String(c.name) : ''));
  const ALWAYS_VISIBLE = new Set(['welcome', 'announcements', 'levels']);

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return channels.map(toId).filter(Boolean);
  }
  // Before onboarding: still show welcome, announcements, levels to everyone (read-only)
  if (!onboardingAccepted || needsOnboardingReaccept) {
    return channels.filter((c) => {
      const id = toId(c).toLowerCase();
      return id === 'welcome' || id === 'announcements' || id === 'levels';
    }).map(toId).filter(Boolean);
  }
  const tier = effectiveTier != null ? effectiveTier : entitlements.tier;
  let allowed = [];
  if (tier === 'FREE') {
    allowed = channels
      .filter((c) => {
        const id = toId(c).toLowerCase();
        if (ALWAYS_VISIBLE.has(id)) return true;
        const nameKey = freeChannelNameKey(c.name);
        const nameLower = (c.name || '').toString().toLowerCase();
        return nameKey && (FREE_CHANNEL_ALLOWLIST.has(nameKey) || FREE_CHANNEL_ALLOWLIST.has(nameLower));
      })
      .map(toId)
      .filter(Boolean);
  } else if (tier === 'PREMIUM') {
    allowed = channels
      .filter((c) => {
        const id = toId(c).toLowerCase();
        if (ALWAYS_VISIBLE.has(id)) return true;
        const level = (c.access_level || c.accessLevel || 'open').toString().toLowerCase();
        const category = (c.category || '').toString().toLowerCase();
        return level === 'premium' || category === 'premium';
      })
      .map(toId)
      .filter(Boolean);
  } else if (tier === 'A7FX') {
    allowed = channels
      .filter((c) => {
        const id = toId(c).toLowerCase();
        if (ALWAYS_VISIBLE.has(id)) return true;
        const level = (c.access_level || c.accessLevel || 'open').toString().toLowerCase();
        const category = (c.category || '').toString().toLowerCase();
        return level === 'a7fx' || category === 'a7fx';
      })
      .map(toId)
      .filter(Boolean);
  } else {
    const allowedLevels = tier === 'ELITE' ? ACCESS_LEVELS_ELITE : ACCESS_LEVELS_PREMIUM;
    allowed = channels
      .filter((c) => {
        const id = toId(c).toLowerCase();
        if (ALWAYS_VISIBLE.has(id)) return true;
        const level = (c.access_level || c.accessLevel || 'open').toString().toLowerCase();
        return allowedLevels.has(level);
      })
      .map(toId)
      .filter(Boolean);
  }
  return allowed;
}

/**
 * Per-channel permission flags. Uses effectiveTier only for gating (no stale cache).
 *
 * SPECIAL RULES:
 * - welcome: visible to ALL users, canWrite only for ADMIN/SUPER_ADMIN (read-only for regular users)
 * - announcements: visible to ALL users, canWrite only for SUPER_ADMIN (shubzfx@gmail.com)
 */
function getChannelPermissions(entitlements, channel) {
  const id = (channel?.id || channel?.name || '').toString().toLowerCase();
  const accessLevel = (channel?.access_level ?? channel?.accessLevel ?? 'open').toString().toLowerCase();
  const permissionType = (channel?.permission_type ?? channel?.permissionType ?? 'read-write').toString().toLowerCase();
  const readOnly = permissionType === 'read-only' || accessLevel === 'read-only';

  const { role } = entitlements;
  const tier = entitlements.effectiveTier != null ? entitlements.effectiveTier : entitlements.tier;

  let canSee = false;
  let canRead = false;
  let canWrite = false;
  let locked = accessLevel === 'admin-only' || accessLevel === 'admin';

  /* Welcome: visible to ALL, write only for SUPER_ADMIN */
  if (id === 'welcome') {
    canSee = true;
    canRead = true;
    canWrite = role === 'SUPER_ADMIN';
    locked = !canWrite;
    return { canSee, canRead, canWrite, locked };
  }

  /* Announcements: visible to ALL, write only for SUPER_ADMIN */
  if (id === 'announcements') {
    canSee = true;
    canRead = true;
    canWrite = role === 'SUPER_ADMIN';
    locked = !canWrite;
    return { canSee, canRead, canWrite, locked };
  }

  /* Levels: visible to ALL, write only for SUPER_ADMIN (level-up messages posted by system or super admin) */
  if (id === 'levels') {
    canSee = true;
    canRead = true;
    canWrite = role === 'SUPER_ADMIN';
    locked = !canWrite;
    return { canSee, canRead, canWrite, locked };
  }

  /* Notifications: visible to ALL, write only for SUPER_ADMIN */
  if (id === 'notifications') {
    canSee = true;
    canRead = true;
    canWrite = role === 'SUPER_ADMIN';
    locked = !canWrite;
    return { canSee, canRead, canWrite, locked };
  }

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
    locked = locked && canSee;
    return { canSee, canRead, canWrite, locked };
  }

  const category = (channel?.category || '').toString().toLowerCase();
  const ALWAYS_VISIBLE_IDS = new Set(['welcome', 'announcements', 'levels', 'notifications']);

  if (tier === 'PREMIUM') {
    canSee = ALWAYS_VISIBLE_IDS.has(id) || accessLevel === 'premium' || category === 'premium';
  } else if (tier === 'A7FX') {
    canSee = ALWAYS_VISIBLE_IDS.has(id) || accessLevel === 'a7fx' || category === 'a7fx';
  } else if (tier === 'ELITE') {
    canSee = ACCESS_LEVELS_ELITE.has(accessLevel);
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
