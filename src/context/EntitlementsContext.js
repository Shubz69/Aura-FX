/**
 * Single source-of-truth: entitlements from /api/me only.
 * Cached 60s. Guards and pages read from here; no duplicate gating logic.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const CACHE_MS = 45 * 1000; // 45s cache for near-instant repeat loads, fresh enough for tier/onboarding

/** Must match AuthContext — one-shot handoff after login /api/me so CommunityGuard does not spin twice. */
const ME_ENTITLEMENTS_SEED_KEY = 'aura_me_entitlements_seed';
const ME_SEED_MAX_AGE_MS = 120_000;

/** Map /api/me user + entitlements into auth user fields (role, tier as subscription_plan for legacy UI). */
function userPatchFromMe(meUser, ent) {
  if (!meUser || !ent) return null;
  const tier = (ent.effectiveTier || ent.tier || 'ACCESS').toString().toUpperCase();
  const st = (ent.status || 'none').toString().toLowerCase();
  const paidish = st === 'active' || st === 'trialing';

  let subscription_plan;
  if ((tier === 'PRO' || tier === 'PREMIUM') && paidish) subscription_plan = 'pro';
  else if ((tier === 'ELITE' || tier === 'A7FX') && paidish) subscription_plan = 'elite';
  else if (tier === 'ACCESS' || tier === 'FREE') subscription_plan = 'access';

  const subscription_status =
    st === 'active'
      ? 'active'
      : st === 'trialing'
        ? 'trialing'
        : st === 'expired'
          ? 'expired'
          : 'inactive';

  const patch = { role: meUser.role };
  if (meUser.level != null) patch.level = meUser.level;
  if (meUser.xp != null) patch.xp = meUser.xp;
  if (subscription_plan !== undefined) patch.subscription_plan = subscription_plan;
  patch.subscription_status = subscription_status;
  return patch;
}

const EntitlementsContext = createContext(null);

export const useEntitlements = () => {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
  return ctx;
};

export const EntitlementsProvider = ({ children }) => {
  const { user, token, mergeUserPatch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cachedAt = useRef(0);
  const fetchInFlight = useRef(false);

  const fetchMe = useCallback(async (force = false) => {
    if (!token || !user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    const now = Date.now();
    if (!force && now - cachedAt.current < CACHE_MS) {
      setLoading(false);
      return;
    }
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const base = process.env.REACT_APP_API_URL ||
        (typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : '');
      const res = await fetch(`${base}/api/me`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        if (res.status === 401) {
          setData(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to load entitlements');
      }
      const json = await res.json();
      if (json.success && json.user && json.entitlements) {
        setData({ user: json.user, entitlements: json.entitlements });
        cachedAt.current = Date.now();
        const patch = userPatchFromMe(json.user, json.entitlements);
        if (patch && typeof mergeUserPatch === 'function') {
          mergeUserPatch(patch);
        }
      } else {
        setData(null);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name !== 'AbortError') setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
      fetchInFlight.current = false;
    }
  }, [token, user?.id, mergeUserPatch]);

  useEffect(() => {
    if (!token || !user?.id) {
      setData(null);
      setLoading(false);
      cachedAt.current = 0;
      return;
    }
    fetchMe();
  }, [token, user?.id, fetchMe]);

  const refresh = useCallback(() => {
    cachedAt.current = 0;
    return fetchMe(true);
  }, [fetchMe]);

  const value = {
    user: data?.user ?? null,
    entitlements: data?.entitlements ?? null,
    loading,
    error,
    refresh
  };

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
};

export default EntitlementsContext;
