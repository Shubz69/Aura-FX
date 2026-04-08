// Role-based access control system
// Super Admin: REACT_APP_SUPER_ADMIN_EMAIL (comma/semicolon) merged with fallback (sync with api/utils/entitlements.js).
// Admin: Assigned by Super Admin - Limited admin access

/** Must match api/utils/entitlements.js SUPER_ADMIN_EMAIL_FALLBACK_LOWER */
const SUPER_ADMIN_EMAIL_FALLBACK_LOWER = Object.freeze([
  'shubzfx@gmail.com',
  'slutherfx@gmail.com',
]);

function parseSuperAdminEmailsLowerFromEnv(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw)
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function mergeSuperAdminEmailsLower() {
  const fromEnv = parseSuperAdminEmailsLowerFromEnv(process.env.REACT_APP_SUPER_ADMIN_EMAIL);
  return Array.from(new Set([...SUPER_ADMIN_EMAIL_FALLBACK_LOWER, ...fromEnv]));
}

/** Lowercased super-admin emails: env + built-in founders list */
export const SUPER_ADMIN_EMAILS_LOWER = mergeSuperAdminEmailsLower();

/** First email for legacy single-string use (env first, else fallback). */
export const SUPER_ADMIN_EMAIL =
  (process.env.REACT_APP_SUPER_ADMIN_EMAIL || '').split(/[,;]/)[0]?.trim() ||
  SUPER_ADMIN_EMAIL_FALLBACK_LOWER[0] ||
  '';

export const ROLES = {
  ACCESS: 'access',
  PRO: 'pro',
  ELITE: 'elite',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

// Admin capabilities - what admins can do
export const ADMIN_CAPABILITIES = {
  // Message Management
  DELETE_MESSAGES: 'delete_messages',
  EDIT_MESSAGES: 'edit_messages',
  VIEW_ALL_MESSAGES: 'view_all_messages',
  
  // Channel Management
  CREATE_CHANNELS: 'create_channels',
  DELETE_CHANNELS: 'delete_channels',
  EDIT_CHANNELS: 'edit_channels',
  MANAGE_CHANNEL_ACCESS: 'manage_channel_access',
  
  // User Management
  VIEW_USERS: 'view_users',
  EDIT_USERS: 'edit_users',
  BAN_USERS: 'ban_users',
  UNBAN_USERS: 'unban_users',
  ASSIGN_ROLES: 'assign_roles',
  VIEW_USER_DETAILS: 'view_user_details',
  
  // Content Management
  MANAGE_COURSES: 'manage_courses',
  MANAGE_ANNOUNCEMENTS: 'manage_announcements',
  MODERATE_CONTENT: 'moderate_content',
  
  // System Management
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_SETTINGS: 'manage_settings',
  VIEW_LOGS: 'view_logs',
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  
  // Support Management
  VIEW_SUPPORT_TICKETS: 'view_support_tickets',
  RESPOND_TO_TICKETS: 'respond_to_tickets',
  CLOSE_TICKETS: 'close_tickets',
  
  // Admin Management (Super Admin only)
  CREATE_ADMINS: 'create_admins',
  DELETE_ADMINS: 'delete_admins',
  EDIT_ADMIN_PERMISSIONS: 'edit_admin_permissions',
  VIEW_ADMIN_ACTIVITY: 'view_admin_activity',
  
  // System Configuration (Super Admin only)
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  MANAGE_DATABASE: 'manage_database',
  MANAGE_INTEGRATIONS: 'manage_integrations',
  VIEW_SYSTEM_LOGS: 'view_system_logs',
  MANAGE_BACKUPS: 'manage_backups'
};

// Super Admin has all capabilities
const SUPER_ADMIN_CAPABILITIES = Object.values(ADMIN_CAPABILITIES);

// Default Admin capabilities (can be customized per admin)
export const DEFAULT_ADMIN_CAPABILITIES = [
  ADMIN_CAPABILITIES.DELETE_MESSAGES,
  ADMIN_CAPABILITIES.EDIT_MESSAGES,
  ADMIN_CAPABILITIES.VIEW_ALL_MESSAGES,
  ADMIN_CAPABILITIES.CREATE_CHANNELS,
  ADMIN_CAPABILITIES.DELETE_CHANNELS,
  ADMIN_CAPABILITIES.EDIT_CHANNELS,
  ADMIN_CAPABILITIES.VIEW_USERS,
  ADMIN_CAPABILITIES.VIEW_USER_DETAILS,
  ADMIN_CAPABILITIES.MODERATE_CONTENT,
  ADMIN_CAPABILITIES.VIEW_SUPPORT_TICKETS,
  ADMIN_CAPABILITIES.RESPOND_TO_TICKETS,
  ADMIN_CAPABILITIES.CLOSE_TICKETS
];

// Get user role from localStorage or user object (permission role USER/ADMIN or stored tier role)
export const getUserRole = (user) => {
  if (!user) {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    return storedUser.role || ROLES.ACCESS;
  }
  return user.role || ROLES.ACCESS;
};

/**
 * Human-readable membership for profile UI.
 * apiRole: USER | ADMIN | SUPER_ADMIN from /api/me (permission role).
 * tier: ACCESS | PRO | ELITE from entitlements (legacy FREE/PREMIUM/A7FX normalized upstream).
 */
export function formatMembershipLabel(apiRole, tier) {
  const r = (apiRole || 'USER').toString().toUpperCase();
  if (r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'ADMIN') return 'Admin';
  const t = (tier || 'ACCESS').toString().toUpperCase();
  if (t === 'ELITE' || t === 'A7FX') return 'Elite';
  if (t === 'PRO' || t === 'PREMIUM') return 'Pro';
  if (t === 'ACCESS' || t === 'FREE') return 'Access';
  return 'Access';
}

/** Lowercase trim for role/plan/status comparisons (JWT may use SUPER_ADMIN; DB may use mixed case). */
export function normalizeRoleKey(value) {
  return (value == null ? '' : String(value)).trim().toLowerCase();
}

/**
 * True when subscription_plan is a paid SKU and status is active or trialing (matches server entitlements).
 */
export function hasActivePaidPlan(user = null) {
  const u = user || JSON.parse(localStorage.getItem('user') || '{}');
  const st = normalizeRoleKey(u.subscription_status);
  if (!['active', 'trialing'].includes(st)) return false;
  const pl = normalizeRoleKey(u.subscription_plan);
  return ['aura', 'a7fx', 'elite', 'premium', 'pro'].includes(pl);
}

// Check if user is admin (handles both uppercase and lowercase role from API/AuthContext)
export const isAdmin = (user = null) => {
  const role = normalizeRoleKey(getUserRole(user));
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
};

/** True if this email is in REACT_APP_SUPER_ADMIN_EMAIL list (case-insensitive). */
export function isConfiguredSuperAdminEmail(email) {
  const e = (email == null ? '' : String(email)).trim().toLowerCase();
  if (!e) return false;
  return SUPER_ADMIN_EMAILS_LOWER.includes(e);
}

// Check if user is super admin
export const isSuperAdmin = (user = null) => {
  const list = SUPER_ADMIN_EMAILS_LOWER;
  if (!user) {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const email = (storedUser.email || '').toString().toLowerCase();
    const role = normalizeRoleKey(storedUser.role);
    if (role === ROLES.SUPER_ADMIN) return true;
    return list.length > 0 && list.includes(email);
  }
  const email = (user.email || '').toString().toLowerCase();
  const role = normalizeRoleKey(user.role);
  if (role === ROLES.SUPER_ADMIN) return true;
  return list.length > 0 && list.includes(email);
};

// Pro / Elite paid access (legacy name: isPremium). Admins included.
export const isPro = (user = null) => {
  const norm = normalizeRoleKey;
  if (!user) {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const role = norm(storedUser.role || ROLES.ACCESS);
    const subscriptionStatus = norm(storedUser.subscription_status || 'inactive');
    const subscriptionPlan = norm(storedUser.subscription_plan);

    return (
      role === ROLES.PRO ||
      role === 'premium' ||
      role === ROLES.ELITE ||
      role === 'a7fx' ||
      role === ROLES.ADMIN ||
      role === ROLES.SUPER_ADMIN ||
      (['active', 'trialing'].includes(subscriptionStatus) &&
        (subscriptionPlan === 'aura' ||
          subscriptionPlan === 'a7fx' ||
          subscriptionPlan === 'elite' ||
          subscriptionPlan === 'premium' ||
          subscriptionPlan === 'pro'))
    );
  }

  const role = norm(user.role || ROLES.ACCESS);
  const subscriptionStatus = norm(user.subscription_status || 'inactive');
  const subscriptionPlan = norm(user.subscription_plan);

  return (
    role === ROLES.PRO ||
    role === 'premium' ||
    role === ROLES.ELITE ||
    role === 'a7fx' ||
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    (['active', 'trialing'].includes(subscriptionStatus) &&
      (subscriptionPlan === 'aura' ||
        subscriptionPlan === 'a7fx' ||
        subscriptionPlan === 'elite' ||
        subscriptionPlan === 'premium' ||
        subscriptionPlan === 'pro'))
  );
};

/** @deprecated Use isPro — alias kept for existing imports */
export const isPremium = isPro;

/**
 * Single client slug for gates, Community channel tier, My Courses, badges.
 * access | pro | elite | admin | super_admin (legacy free/premium/a7fx still read from DB)
 * Prefer /api/me entitlements; fall back to subscription_* on user (EntitlementsContext merge).
 */
export function getClientAccessTier(user, entitlements = null) {
  if (!user || typeof user !== 'object') return 'access';
  if (isSuperAdmin(user)) return 'super_admin';
  if (isAdmin(user)) return 'admin';

  const tier = (entitlements?.effectiveTier || entitlements?.tier || '').toString().toUpperCase();
  if (tier === 'ELITE' || tier === 'A7FX') return 'elite';
  if (tier === 'PRO' || tier === 'PREMIUM') return 'pro';

  if (hasActivePaidPlan(user)) {
    const pl = normalizeRoleKey(user.subscription_plan);
    if (['a7fx', 'elite'].includes(pl)) return 'elite';
    if (['aura', 'premium', 'pro'].includes(pl)) return 'pro';
  }

  const r = normalizeRoleKey(user.role);
  if (r === 'premium' || r === 'pro') return 'pro';
  if (r === 'a7fx' || r === 'elite') return 'elite';
  if (r === 'free' || r === 'access') return 'access';

  return 'access';
}

// Get user's capabilities
export const getUserCapabilities = (user = null) => {
  if (isSuperAdmin(user)) {
    return SUPER_ADMIN_CAPABILITIES;
  }
  
  if (isAdmin(user)) {
    // Get admin capabilities from user object or localStorage
    if (!user) {
      user = JSON.parse(localStorage.getItem('user') || '{}');
    }
    
    // Check if admin has custom capabilities assigned
    if (user.capabilities && Array.isArray(user.capabilities)) {
      return user.capabilities;
    }
    
    // Default admin capabilities
    return DEFAULT_ADMIN_CAPABILITIES;
  }
  
  return [];
};

// Check if user has specific capability
export const hasCapability = (capability, user = null) => {
  const capabilities = getUserCapabilities(user);
  return capabilities.includes(capability);
};

// Get capability display name
export const getCapabilityName = (capability) => {
  const names = {
    [ADMIN_CAPABILITIES.DELETE_MESSAGES]: 'Delete Messages',
    [ADMIN_CAPABILITIES.EDIT_MESSAGES]: 'Edit Messages',
    [ADMIN_CAPABILITIES.VIEW_ALL_MESSAGES]: 'View All Messages',
    [ADMIN_CAPABILITIES.CREATE_CHANNELS]: 'Create Channels',
    [ADMIN_CAPABILITIES.DELETE_CHANNELS]: 'Delete Channels',
    [ADMIN_CAPABILITIES.EDIT_CHANNELS]: 'Edit Channels',
    [ADMIN_CAPABILITIES.MANAGE_CHANNEL_ACCESS]: 'Manage Channel Access',
    [ADMIN_CAPABILITIES.VIEW_USERS]: 'View Users',
    [ADMIN_CAPABILITIES.EDIT_USERS]: 'Edit Users',
    [ADMIN_CAPABILITIES.BAN_USERS]: 'Ban Users',
    [ADMIN_CAPABILITIES.UNBAN_USERS]: 'Unban Users',
    [ADMIN_CAPABILITIES.ASSIGN_ROLES]: 'Assign Roles',
    [ADMIN_CAPABILITIES.VIEW_USER_DETAILS]: 'View User Details',
    [ADMIN_CAPABILITIES.MANAGE_COURSES]: 'Manage Courses',
    [ADMIN_CAPABILITIES.MANAGE_ANNOUNCEMENTS]: 'Manage Announcements',
    [ADMIN_CAPABILITIES.MODERATE_CONTENT]: 'Moderate Content',
    [ADMIN_CAPABILITIES.VIEW_ANALYTICS]: 'View Analytics',
    [ADMIN_CAPABILITIES.MANAGE_SETTINGS]: 'Manage Settings',
    [ADMIN_CAPABILITIES.VIEW_LOGS]: 'View Logs',
    [ADMIN_CAPABILITIES.MANAGE_SUBSCRIPTIONS]: 'Manage Subscriptions',
    [ADMIN_CAPABILITIES.VIEW_SUPPORT_TICKETS]: 'View Support Tickets',
    [ADMIN_CAPABILITIES.RESPOND_TO_TICKETS]: 'Respond to Tickets',
    [ADMIN_CAPABILITIES.CLOSE_TICKETS]: 'Close Tickets',
    [ADMIN_CAPABILITIES.CREATE_ADMINS]: 'Create Admins',
    [ADMIN_CAPABILITIES.DELETE_ADMINS]: 'Delete Admins',
    [ADMIN_CAPABILITIES.EDIT_ADMIN_PERMISSIONS]: 'Edit Admin Permissions',
    [ADMIN_CAPABILITIES.VIEW_ADMIN_ACTIVITY]: 'View Admin Activity',
    [ADMIN_CAPABILITIES.MANAGE_SYSTEM_SETTINGS]: 'Manage System Settings',
    [ADMIN_CAPABILITIES.MANAGE_DATABASE]: 'Manage Database',
    [ADMIN_CAPABILITIES.MANAGE_INTEGRATIONS]: 'Manage Integrations',
    [ADMIN_CAPABILITIES.VIEW_SYSTEM_LOGS]: 'View System Logs',
    [ADMIN_CAPABILITIES.MANAGE_BACKUPS]: 'Manage Backups'
  };
  return names[capability] || capability;
};

// Get capability category
export const getCapabilityCategory = (capability) => {
  if (capability.includes('MESSAGE')) return 'Messages';
  if (capability.includes('CHANNEL')) return 'Channels';
  if (capability.includes('USER')) return 'Users';
  if (capability.includes('COURSE') || capability.includes('ANNOUNCEMENT') || capability.includes('CONTENT')) return 'Content';
  if (capability.includes('ANALYTICS') || capability.includes('LOG') || capability.includes('SETTING')) return 'System';
  if (capability.includes('SUBSCRIPTION')) return 'Subscriptions';
  if (capability.includes('TICKET') || capability.includes('SUPPORT')) return 'Support';
  if (capability.includes('ADMIN')) return 'Admin Management';
  if (capability.includes('DATABASE') || capability.includes('BACKUP') || capability.includes('INTEGRATION')) return 'System Configuration';
  return 'Other';
};

