/**
 * Client: same normalization rules as api/utils/subscriptionNormalize.js (keep in sync).
 * CRA bundles this file; logic is duplicated minimally to avoid fragile cross-folder requires.
 */

export const ENTITLEMENT_TIER = Object.freeze({
  ACCESS: 'ACCESS',
  PRO: 'PRO',
  ELITE: 'ELITE'
});

export function normalizeKey(v) {
  return (v == null ? '' : String(v)).trim().toLowerCase();
}

export function canonicalStoredPlanFromAny(planOrRole) {
  const p = normalizeKey(planOrRole);
  if (!p) return '';
  if (p === 'free' || p === 'open') return 'access';
  if (p === 'premium' || p === 'aura' || p === 'pro') return 'pro';
  if (p === 'a7fx' || p === 'elite') return 'elite';
  if (p === 'access') return 'access';
  return '';
}

export function isProPlanId(plan) {
  return canonicalStoredPlanFromAny(plan) === 'pro';
}

export function isElitePlanId(plan) {
  return canonicalStoredPlanFromAny(plan) === 'elite';
}

export function canonicalSubscriptionRoleFromDb(role) {
  const r = normalizeKey(role);
  if (!r || r === 'user') return '';
  if (r === 'free') return 'access';
  if (r === 'premium') return 'pro';
  if (r === 'a7fx' || r === 'elite') return 'elite';
  if (r === 'access') return 'access';
  if (r === 'pro') return 'pro';
  return '';
}

export function subscriptionSnapshotMatchesCurrent(snapshot, userRow) {
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
