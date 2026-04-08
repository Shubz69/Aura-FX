/**
 * Canonical subscription naming (shared by API + client via re-export).
 * Entitlement tiers: ACCESS | PRO | ELITE
 * Stored tier-like roles/plans: access | pro | elite (+ admin | super_admin for permission roles)
 * All legacy DB/payload values (free, premium, a7fx, aura, …) normalize on read.
 */

'use strict';

const ENTITLEMENT_TIER = Object.freeze({
  ACCESS: 'ACCESS',
  PRO: 'PRO',
  ELITE: 'ELITE'
});

function normalizeKey(v) {
  return (v == null ? '' : String(v)).trim().toLowerCase();
}

/** Stripe / internal plan ids and legacy aliases → canonical stored plan: access | pro | elite | '' */
function canonicalStoredPlanFromAny(planOrRole) {
  const p = normalizeKey(planOrRole);
  if (!p) return '';
  if (p === 'free' || p === 'open') return 'access';
  if (p === 'premium' || p === 'aura' || p === 'pro') return 'pro';
  if (p === 'a7fx' || p === 'elite') return 'elite';
  if (p === 'access') return 'access';
  return '';
}

/** True if this subscription_plan value (legacy or canonical) is the paid Pro SKU. */
function isProPlanId(plan) {
  return canonicalStoredPlanFromAny(plan) === 'pro';
}

/** True if Elite SKU (legacy a7fx collapses here). */
function isElitePlanId(plan) {
  return canonicalStoredPlanFromAny(plan) === 'elite';
}

/**
 * Non-admin DB role string for subscription tier → canonical access | pro | elite | ''.
 * 'user' / empty → ''.
 */
function canonicalSubscriptionRoleFromDb(role) {
  const r = normalizeKey(role);
  if (!r || r === 'user') return '';
  if (r === 'free') return 'access';
  if (r === 'premium') return 'pro';
  if (r === 'a7fx' || r === 'elite') return 'elite';
  if (r === 'access') return 'access';
  if (r === 'pro') return 'pro';
  return '';
}

/** For onboarding snapshot vs current plan/role equality (legacy free ↔ access). */
function subscriptionSnapshotMatchesCurrent(snapshot, userRow) {
  const snap = normalizeKey(snapshot);
  const plan = normalizeKey(userRow?.subscription_plan);
  const role = normalizeKey(userRow?.role);
  const current = plan || role || 'free';
  const cs = canonicalStoredPlanFromAny(snap) || canonicalSubscriptionRoleFromDb(snap) || snap;
  const cc = canonicalStoredPlanFromAny(current) || canonicalSubscriptionRoleFromDb(current) || current;
  if (cs === cc) return true;
  if ((cs === 'access' || snap === 'free' || snap === 'open') && (cc === 'access' || current === 'free')) return true;
  if ((cs === 'pro' || snap === 'premium' || snap === 'aura') && (cc === 'pro' || current === 'premium' || current === 'aura')) return true;
  if ((cs === 'elite' || snap === 'a7fx') && (cc === 'elite' || current === 'a7fx')) return true;
  return false;
}

module.exports = {
  ENTITLEMENT_TIER,
  normalizeKey,
  canonicalStoredPlanFromAny,
  isProPlanId,
  isElitePlanId,
  canonicalSubscriptionRoleFromDb,
  subscriptionSnapshotMatchesCurrent
};
