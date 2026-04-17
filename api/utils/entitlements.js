/**
 * Single source-of-truth for access: roles, tiers, and per-channel permissions.
 * Used by: /api/me, /api/community/channels, /api/community/channels/messages,
 * /api/community/bootstrap, AI endpoints, and WebSocket server.
 *
 * Channel access is decided ONLY by: (1) user role + tier (entitlements), (2) channel access_level
 * and permission_type. Category is NEVER used for access—only for grouping in the sidebar.
 *
 * ROLES (from DB): USER | ADMIN | SUPER_ADMIN
 * TIERS (from entitlements/subscription): ACCESS | PRO | ELITE (legacy free/premium/a7fx map on read)
 *
 * RULES:
 * 1) Admin override: role ADMIN or SUPER_ADMIN → canSee/canRead true for all; canWrite true unless read-only.
 * 2) ACCESS (role USER): hard allowlist—only channel ids general, welcome, announcements. All others canSee=false.
 * 3) PRO (role USER): canSee where access_level in open, free, read-only, premium, support, staff. Not a7fx/elite/admin-only.
 * 4) ELITE (role USER): PRO visibility plus access_level a7fx, elite (legacy A7FX tier merged into ELITE).
 * 5) Write: canWrite = false if permission_type === 'read-only' OR access_level === 'read-only'; else true when canSee.
 */
const {
  ENTITLEMENT_TIER,
  isProPlanId,
  isElitePlanId,
  subscriptionSnapshotMatchesCurrent
} = require('./subscriptionNormalize');
const { canAccessSurveillance: reportsCanAccessSurveillance } = require('../reports/resolveReportsRole');

const FREE_CHANNEL_ALLOWLIST = new Set(['general', 'welcome', 'announcements', 'levels', 'notifications']);

/**
 * Core super-admin accounts (always merged with SUPER_ADMIN_EMAIL env).
 * Keeps access if env is misconfigured on a host; add more via env for other operators.
 * Client: keep in sync with src/utils/roles.js SUPER_ADMIN_EMAIL_FALLBACK_LOWER.
 */
const SUPER_ADMIN_EMAIL_FALLBACK_LOWER = Object.freeze([
  'slutherfx@gmail.com',
  'auraterminal2002@gmail.com',
]);

/**
 * Super-admin emails: SUPER_ADMIN_EMAIL env (comma/semicolon) merged with fallback list.
 * DB role `super_admin` still works when email is not listed.
 */
function getSuperAdminEmailsLower() {
  const raw = process.env.SUPER_ADMIN_EMAIL;
  const fromEnv =
    raw == null || String(raw).trim() === ''
      ? []
      : String(raw)
          .split(/[,;]/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
  return Array.from(new Set([...SUPER_ADMIN_EMAIL_FALLBACK_LOWER, ...fromEnv]));
}

/** First entry only — backward compatibility for callers that expect one string. */
function getSuperAdminEmailLower() {
  const all = getSuperAdminEmailsLower();
  return all[0] || '';
}

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
 * Compute tier from user row: ACCESS | PRO | ELITE only (legacy DB values mapped on read).
 * Super admin by email gets ELITE. ADMIN/SUPER_ADMIN get full access via role override.
 * Downgrades: effective tier is current DB state (immediate downgrade when plan/role updated).
 */
function getTier(userRow) {
  if (!userRow) return ENTITLEMENT_TIER.ACCESS;
  if (isSuperAdminEmail(userRow)) return ENTITLEMENT_TIER.ELITE;
  const adminRole = normalizeRole(userRow.role);
  if (adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN') return ENTITLEMENT_TIER.ELITE;
  const role = (userRow.role || '').toLowerCase();
  const plan = (userRow.subscription_plan || '').toLowerCase();
  const status = (userRow.subscription_status || '').toLowerCase();
  const expiry = userRow.subscription_expiry ? new Date(userRow.subscription_expiry) : null;
  const hasExpiry = Boolean(expiry && !Number.isNaN(expiry.getTime()));
  const expiryOk = !hasExpiry || expiry > new Date();
  const paidThrough =
    (status === 'active' || status === 'trialing') &&
    expiryOk &&
    !userRow.payment_failed;
  if (paidThrough && isElitePlanId(plan)) return ENTITLEMENT_TIER.ELITE;
  if (['elite', 'a7fx'].includes(role) || (paidThrough && isElitePlanId(plan))) return ENTITLEMENT_TIER.ELITE;
  if (
    role === 'premium' ||
    role === 'pro' ||
    role === 'aura' ||
    (paidThrough && isProPlanId(plan))
  ) {
    return ENTITLEMENT_TIER.PRO;
  }
  return ENTITLEMENT_TIER.ACCESS;
}

/** Effective tier for gating: same as tier (immediate downgrade model). Use this for channel/message access. */
function getEffectiveTier(userRow) {
  return getTier(userRow);
}

function isSuperAdminEmail(userRowOrEmail) {
  const allowed = getSuperAdminEmailsLower();
  if (!allowed.length) return false;
  const email =
    typeof userRowOrEmail === 'string'
      ? userRowOrEmail
      : (userRowOrEmail?.email || '');
  const e = String(email).trim().toLowerCase();
  return allowed.includes(e);
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
  if (tier === ENTITLEMENT_TIER.ELITE && !['elite', 'a7fx', 'admin', 'super_admin'].includes(snapshot)) return true;
  if (
    tier === ENTITLEMENT_TIER.PRO &&
    !['premium', 'aura', 'pro', 'elite', 'a7fx', 'admin', 'super_admin'].includes(snapshot)
  ) {
    return true;
  }
  if (tier === ENTITLEMENT_TIER.ACCESS && !['free', 'open', 'access', ''].includes(snapshot)) return true;
  if (!subscriptionSnapshotMatchesCurrent(snapshot, userRow)) return true;
  return false;
}

/**
 * User shape for reports/resolveReportsRole (Surveillance, Trader DNA).
 * Must treat SUPER_ADMIN_EMAIL / fallback list like normalize entitlements.role.
 */
function buildSurveillanceGateUser(userRow) {
  if (!userRow) return null;
  const normalized = isSuperAdminEmail(userRow) ? 'SUPER_ADMIN' : normalizeRole(userRow.role);
  let roleForGate;
  if (normalized === 'SUPER_ADMIN') roleForGate = 'super_admin';
  else if (normalized === 'ADMIN') roleForGate = 'admin';
  else roleForGate = userRow.role || 'user';
  return {
    role: roleForGate,
    subscription_plan: userRow.subscription_plan,
    subscription_status: userRow.subscription_status,
    subscription_expiry: userRow.subscription_expiry,
    payment_failed: userRow.payment_failed,
  };
}

/**
 * Entitlements from a single user row (no DB in this function).
 * canAccessCommunity: true only when plan is selected (ACCESS/PRO/ELITE) or admin—blocks until /choose-plan.
 * Channel gating uses effectiveTier only (no stale cached tier).
 */
function getEntitlements(userRow) {
  if (!userRow) {
    return {
      role: 'USER',
      tier: ENTITLEMENT_TIER.ACCESS,
      effectiveTier: ENTITLEMENT_TIER.ACCESS,
      pendingTier: null,
      periodEnd: null,
      status: 'none',
      canAccessCommunity: false,
      canAccessAI: false,
      canAccessSurveillance: false,
      allowedChannelSlugs: [],
      onboardingAccepted: false,
      needsOnboardingReaccept: true,
      isSuperAdminUser: false
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
  /** Same staff recognition as `role` above — raw DB role alone misses env-listed super admins. */
  const surveillanceUser = buildSurveillanceGateUser(userRow);
  return {
    role,
    tier,
    effectiveTier,
    pendingTier: null,
    periodEnd,
    status,
    canAccessCommunity: isAdmin || planSelected,
    canAccessAI: isAdmin || tier === ENTITLEMENT_TIER.PRO || tier === ENTITLEMENT_TIER.ELITE,
    canAccessSurveillance: reportsCanAccessSurveillance(surveillanceUser),
    allowedChannelSlugs: [],
    onboardingAccepted: isAdmin || onboardingAccepted,
    needsOnboardingReaccept: needsReaccept,
    isSuperAdminUser
  };
}

/**
 * Normalize channel name for ACCESS-tier allowlist match (avoid general vs general-chat).
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
  const { role, onboardingAccepted, needsOnboardingReaccept } = entitlements;
  const toId = (c) => (c.id != null ? String(c.id) : (c.name != null ? String(c.name) : ''));

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
  // Single source of truth: must match getChannelPermissions (fixes PRO missing general/open, etc.)
  return channels
    .filter((c) => {
      const perm = getChannelPermissions(entitlements, {
        id: c.id,
        name: c.name,
        access_level: c.access_level ?? c.accessLevel,
        permission_type: c.permission_type ?? c.permissionType,
        category: c.category,
      });
      return perm.canSee;
    })
    .map(toId)
    .filter(Boolean);
}

/**
 * Per-channel permission flags. Uses effectiveTier only for gating (no stale cache).
 *
 * SPECIAL RULES:
 * - welcome: visible to ALL users, canWrite only for ADMIN/SUPER_ADMIN (read-only for regular users)
 * - announcements: visible to ALL users, canWrite only for SUPER_ADMIN
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
    canWrite = true; /* Admins/super_admins can post in ALL channels including read-only */
    locked = false;
    return { canSee, canRead, canWrite, locked };
  }

  if (tier === ENTITLEMENT_TIER.ACCESS) {
    const nameKey = freeChannelNameKey(channel?.name);
    const nameLower = (channel?.name || '').toString().toLowerCase();
    canSee = FREE_CHANNEL_ALLOWLIST.has(id) || (nameKey && FREE_CHANNEL_ALLOWLIST.has(nameKey)) || FREE_CHANNEL_ALLOWLIST.has(nameLower);
    canRead = canSee;
    canWrite = canSee && !readOnly;
    locked = locked && canSee;
    return { canSee, canRead, canWrite, locked };
  }

  const category = (channel?.category || '').toString().toLowerCase();
  const ALWAYS_VISIBLE_IDS = new Set(['welcome', 'announcements', 'levels', 'notifications', 'general']);

  if (tier === ENTITLEMENT_TIER.PRO) {
    canSee = ALWAYS_VISIBLE_IDS.has(id) || ACCESS_LEVELS_PREMIUM.has(accessLevel) || accessLevel === 'premium' || category === 'premium';
  } else if (tier === ENTITLEMENT_TIER.ELITE) {
    canSee =
      ALWAYS_VISIBLE_IDS.has(id) ||
      ACCESS_LEVELS_ELITE.has(accessLevel) ||
      accessLevel === 'a7fx' ||
      category === 'a7fx';
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
  if (tier === ENTITLEMENT_TIER.ACCESS) return FREE_CHANNEL_ALLOWLIST.has(slug);
  const channel = Array.isArray(channels) ? channels.find((c) => (c.id || c.name || '').toString().toLowerCase() === slug) : null;
  if (!channel) return false;
  const perm = getChannelPermissions(entitlements, channel);
  return perm.canSee;
}

module.exports = {
  ENTITLEMENT_TIER,
  FREE_CHANNEL_ALLOWLIST,
  getSuperAdminEmailLower,
  getSuperAdminEmailsLower,
  isSuperAdminEmail,
  normalizeRole,
  getTier,
  getEffectiveTier,
  getStatus,
  hasPlanSelected,
  getEntitlements,
  buildSurveillanceGateUser,
  getAllowedChannelSlugs,
  getChannelPermissions,
  canAccessChannel
};
