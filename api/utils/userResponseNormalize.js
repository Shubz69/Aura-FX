/**
 * Normalize user rows for API responses: separate permission role (USER | ADMIN | SUPER_ADMIN)
 * from subscription tier plan (access | pro | elite). Does not change DB reads or /api/me shape.
 */

'use strict';

const { normalizeRole, isSuperAdminEmail } = require('./entitlements');
const {
  canonicalStoredPlanFromAny,
  canonicalSubscriptionRoleFromDb,
  normalizeKey
} = require('./subscriptionNormalize');

/** Permission role for API — matches /api/me entitlements.role */
function permissionRoleFromUserRow(userRow) {
  if (!userRow) return 'USER';
  if (isSuperAdminEmail(userRow)) return 'SUPER_ADMIN';
  return normalizeRole(userRow.role);
}

/**
 * Canonical subscription plan for responses: access | pro | elite | null.
 * null: staff (admin/super_admin) or no tier selected (USER with empty plan).
 */
function canonicalSubscriptionPlanForResponse(userRow) {
  if (!userRow) return null;
  const planRaw = (userRow.subscription_plan || '').toString().trim();
  if (planRaw) {
    const c = canonicalStoredPlanFromAny(planRaw);
    if (c) return c;
  }
  const r = normalizeKey(userRow.role);
  if (r === 'admin' || r === 'super_admin') return null;
  const fromRole = canonicalSubscriptionRoleFromDb(userRow.role);
  return fromRole || null;
}

module.exports = {
  permissionRoleFromUserRow,
  canonicalSubscriptionPlanForResponse
};
