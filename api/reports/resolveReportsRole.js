/**
 * Single source for monthly-reports tier resolution (nominal vs billing-aware).
 *
 * - resolveNominalReportsRole(user): role/plan columns only (ignores payment & dates).
 * - effectiveReportsRole(user): use for gating paid features — requires active/trialing
 *   subscription, no payment_failed, and either a future expiry or no expiry set (ongoing / lifetime rows).
 *   Admins always "admin".
 * - canAccessTraderDna(user): Elite-only product rule (+ admin/super_admin for support).
 * - canAccessSurveillance(user): same rule as Trader DNA (Elite terminal).
 *
 * Keeping this in one module avoids the four copies of resolveRole drifting apart.
 */

function resolveNominalReportsRole(user) {
  if (!user) return 'access';
  const role = (user.role || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const plan = (user.subscription_plan || '').toString().trim().toLowerCase();
  // JWT/API permission roles (USER) never imply paid tier — use subscription_plan
  if (['admin', 'super_admin'].includes(role)) return 'admin';
  if (['elite', 'a7fx'].includes(role) || ['elite', 'a7fx'].includes(plan)) return 'elite';
  if (['premium', 'pro', 'aura'].includes(role) || ['premium', 'aura', 'pro'].includes(plan)) return 'pro';
  return 'access';
}

/**
 * Tier for reports + billing-sensitive APIs: inactive / expired / failed payment → free.
 */
function effectiveReportsRole(user) {
  if (!user) return 'access';
  const role = (user.role || '').toString().trim().toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return 'admin';

  const failed = user.payment_failed === 1 || user.payment_failed === true;
  if (failed) return 'access';

  const status = (user.subscription_status || '').toLowerCase();
  const expiry = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
  const now = Date.now();
  const hasExpiry = Boolean(expiry && !Number.isNaN(expiry.getTime()));
  /** Active/trialing with no end date (null expiry) still counts as paid-through — matches many Elite / admin-grant rows. */
  const expiryOk = !hasExpiry || expiry.getTime() > now;

  const billingActive =
    (status === 'active' || status === 'trialing') &&
    expiryOk;

  if (!billingActive) return 'access';

  const nominal = resolveNominalReportsRole(user);
  if (nominal === 'admin') return 'admin';
  if (nominal === 'elite') return 'elite';
  if (nominal === 'pro') return 'pro';
  return 'access';
}

/** Trader DNA is Elite-only; staff roles may still open the tool. */
function canAccessTraderDna(user) {
  if (!user) return false;
  const role = (user.role || '').toString().trim().toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return true;
  return effectiveReportsRole(user) === 'elite';
}

/** Surveillance terminal: same billing-aware Elite gate as Trader DNA. */
function canAccessSurveillance(user) {
  return canAccessTraderDna(user);
}

module.exports = {
  resolveNominalReportsRole,
  effectiveReportsRole,
  canAccessTraderDna,
  canAccessSurveillance,
};
