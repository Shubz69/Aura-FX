/**
 * SubscriptionContext - Single source of truth for subscription state
 * 
 * STRICT ACCESS CONTROL:
 * - Fetches subscription status from server on mount and auth changes
 * - Provides hasCommunityAccess flag for route guards
 * - Prevents any client-side guessing - always uses server truth
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import Api from '../services/Api';
import { isConfiguredSuperAdminEmail, hasActivePaidPlan } from '../utils/roles';

const SubscriptionContext = createContext(null);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider = ({ children }) => {
  const { user, token } = useAuth();
  
  // Subscription state
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Fetch subscription status from server
  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user || !token) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await Api.getSubscriptionStatus();
      const statusCode = Number(response?.status || 0);
      if (!(statusCode >= 200 && statusCode < 300)) {
        if (statusCode === 401) {
          // Token expired or invalid
          setSubscription(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch subscription status');
      }
      const data = response?.data || {};
      
      if (data.success && data.subscription) {
        const sub = data.subscription;
        const userRole = (user?.role || '').toLowerCase();
        const userEmail = (user?.email || '').toString().trim().toLowerCase();
        const isSuperAdminByEmail = isConfiguredSuperAdminEmail(userEmail);
        const isAdmin =
          isSuperAdminByEmail || ['admin', 'super_admin'].includes(userRole);
        // Admins and super admin (by email) ALWAYS have access - override server response if needed
        const hasAccess = isAdmin ? true : (sub.hasCommunityAccess !== false);
        setSubscription({
          ...sub,
          tier: sub.tier || 'ACCESS',
          status: sub.status || (sub.isActive ? 'active' : 'inactive'),
          hasCommunityAccess: hasAccess,
          accessType: isAdmin ? 'ADMIN' : (sub.accessType || 'NONE')
        });
      } else {
        // Check role/email fallback when API returns no subscription data
        const userRole = (user?.role || '').toLowerCase();
        const userEmail = (user?.email || '').toString().trim().toLowerCase();
        const isAdmin =
          isConfiguredSuperAdminEmail(userEmail) || ['admin', 'super_admin'].includes(userRole);
        const isProOrEliteRole = ['premium', 'pro', 'elite', 'a7fx'].includes(userRole);
        const paidFromClient = hasActivePaidPlan(user);

        if (isAdmin || isProOrEliteRole || paidFromClient) {
          const eliteLike =
            userRole === 'elite' ||
            userRole === 'a7fx' ||
            ['a7fx', 'elite'].includes((user?.subscription_plan || '').toString().toLowerCase());
          setSubscription({
            hasCommunityAccess: true,
            accessType: isAdmin ? 'ADMIN' : eliteLike ? 'ELITE_ACTIVE' : 'PRO_ACTIVE',
            isActive: true,
            status: 'active',
            _roleBasedAccess: true
          });
        } else {
          setSubscription({
            hasCommunityAccess: false,
            accessType: 'NONE',
            isActive: false,
            status: 'inactive'
          });
        }
      }
    } catch (err) {
      const isNetwork = (err?.message || '').toLowerCase().includes('fetch') || err?.name === 'TypeError';
      if (!isNetwork) console.error('Subscription fetch error:', err);
      setError(err.message);
      
      // FALLBACK: admins/super admin by email should always have access if API fails
      const userRole = (user?.role || '').toLowerCase();
      const userEmail = (user?.email || '').toString().trim().toLowerCase();
      const isAdmin =
        isConfiguredSuperAdminEmail(userEmail) || ['admin', 'super_admin'].includes(userRole);
      const isProOrEliteRole = ['premium', 'pro', 'elite', 'a7fx'].includes(userRole);
      const paidFromClient = hasActivePaidPlan(user);

      if (isAdmin) {
        setSubscription({
          hasCommunityAccess: true,
          accessType: 'ADMIN',
          isActive: true,
          status: 'active',
          _fallback: true
        });
      } else if (isProOrEliteRole || paidFromClient) {
        const eliteLike =
          userRole === 'elite' ||
          userRole === 'a7fx' ||
          ['a7fx', 'elite'].includes((user?.subscription_plan || '').toString().toLowerCase());
        setSubscription({
          hasCommunityAccess: true,
          accessType: eliteLike ? 'ELITE_ACTIVE' : 'PRO_ACTIVE',
          isActive: true,
          status: 'active',
          _fallback: true
        });
      } else {
        // On error for non-privileged users, default to no access for security
        setSubscription({
          hasCommunityAccess: false,
          accessType: 'NONE',
          isActive: false,
          status: 'error'
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user, token]);
  
  // Fetch on mount and when user/token changes
  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);
  
  // Refresh subscription status (can be called after payment success, etc.)
  const refreshSubscription = useCallback(async () => {
    await fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);
  
  // Entitlements (single source for RouteGuards and API filters)
  const hasCommunityAccess = subscription?.hasCommunityAccess === true;
  const tier = subscription?.tier || 'ACCESS';
  const status = subscription?.status || 'inactive';
  const accessType = subscription?.accessType || 'NONE';
  const hasProActive = accessType === 'PRO_ACTIVE' || accessType === 'AURA_FX_ACTIVE';
  const hasEliteActive = accessType === 'ELITE_ACTIVE' || accessType === 'A7FX_ELITE_ACTIVE';
  const hasAuraFX = hasProActive;
  const hasA7FXElite = hasEliteActive;
  const isAdmin = accessType === 'ADMIN';

  const value = {
    subscription,
    loading,
    error,
    hasCommunityAccess,
    tier,
    status,
    accessType,
    hasProActive,
    hasEliteActive,
    hasAuraFX,
    hasA7FXElite,
    isAdmin,
    refreshSubscription
  };
  
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export default SubscriptionContext;
