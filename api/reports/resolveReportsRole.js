/**
 * Single source for monthly-reports tier resolution (nominal vs billing-aware).
 *
 * - resolveNominalReportsRole(user): role/plan columns only (ignores payment & dates).
 * - effectiveReportsRole(user): use for gating paid features — requires active/trialing
 *   subscription, future expiry, and no payment_failed. Admins always "admin".
 * - canAccessTraderDna(user): Elite-only product rule (+ admin/super_admin for support).
 *
 * Keeping this in one module avoids the four copies of resolveRole drifting apart.
 */

function resolveNominalReportsRole(user) {
  if (!user) return 'free';
  const role = (user.role || '').toLowerCase();
  const plan = (user.subscription_plan || '').toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return 'admin';
  if (['elite', 'a7fx'].includes(role) || ['elite', 'a7fx'].includes(plan)) return 'elite';
  if (['premium', 'aura'].includes(role) || ['premium', 'aura'].includes(plan)) return 'premium';
  return 'free';
}

/**
 * Tier for reports + billing-sensitive APIs: inactive / expired / failed payment → free.
 */
function effectiveReportsRole(user) {
  if (!user) return 'free';
  const role = (user.role || '').toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return 'admin';

  const failed = user.payment_failed === 1 || user.payment_failed === true;
  if (failed) return 'free';

  const status = (user.subscription_status || '').toLowerCase();
  const expiry = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
  const now = Date.now();
  const expiryOk =
    expiry &&
    !Number.isNaN(expiry.getTime()) &&
    expiry.getTime() > now;

  const billingActive =
    (status === 'active' || status === 'trialing') &&
    expiryOk;

  if (!billingActive) return 'free';

  const nominal = resolveNominalReportsRole(user);
  if (nominal === 'admin') return 'admin';
  if (nominal === 'elite') return 'elite';
  if (nominal === 'premium') return 'premium';
  return 'free';
}

/** Trader DNA is Elite-only; staff roles may still open the tool. */
function canAccessTraderDna(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return true;
  return effectiveReportsRole(user) === 'elite';
}

module.exports = {
  resolveNominalReportsRole,
  effectiveReportsRole,
  canAccessTraderDna,
};
