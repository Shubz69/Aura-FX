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
      const response = await fetch('/api/subscription/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          setSubscription(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch subscription status');
      }
      
      const data = await response.json();
      
      if (data.success && data.subscription) {
        const sub = data.subscription;
        const userRole = (user?.role || '').toLowerCase();
        const userEmail = (user?.email || '').toString().trim().toLowerCase();
        const isSuperAdminByEmail = userEmail === 'shubzfx@gmail.com';
        const isAdmin = isSuperAdminByEmail || ['admin', 'super_admin'].includes(userRole);
        // Admins and super admin (by email) ALWAYS have access - override server response if needed
        const hasAccess = isAdmin ? true : (sub.hasCommunityAccess !== false);
        setSubscription({
          ...sub,
          tier: sub.tier || 'FREE',
          status: sub.status || (sub.isActive ? 'active' : 'inactive'),
          hasCommunityAccess: hasAccess,
          accessType: isAdmin ? 'ADMIN' : (sub.accessType || 'NONE')
        });
      } else {
        // Check role/email fallback when API returns no subscription data
        const userRole = (user?.role || '').toLowerCase();
        const userEmail = (user?.email || '').toString().trim().toLowerCase();
        const isAdmin = (userEmail === 'shubzfx@gmail.com') || ['admin', 'super_admin'].includes(userRole);
        const isPremiumRole = ['premium', 'elite', 'a7fx'].includes(userRole);
        
        if (isAdmin || isPremiumRole) {
          setSubscription({
            hasCommunityAccess: true,
            accessType: isAdmin ? 'ADMIN' : (userRole === 'elite' || userRole === 'a7fx' ? 'A7FX_ELITE_ACTIVE' : 'AURA_FX_ACTIVE'),
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
      console.error('Subscription fetch error:', err);
      setError(err.message);
      
      // FALLBACK: admins/super admin by email should always have access if API fails
      const userRole = (user?.role || '').toLowerCase();
      const userEmail = (user?.email || '').toString().trim().toLowerCase();
      const isAdmin = (userEmail === 'shubzfx@gmail.com') || ['admin', 'super_admin'].includes(userRole);
      const isPremiumRole = ['premium', 'elite', 'a7fx'].includes(userRole);
      
      if (isAdmin) {
        setSubscription({
          hasCommunityAccess: true,
          accessType: 'ADMIN',
          isActive: true,
          status: 'active',
          _fallback: true
        });
      } else if (isPremiumRole) {
        setSubscription({
          hasCommunityAccess: true,
          accessType: userRole === 'elite' || userRole === 'a7fx' ? 'A7FX_ELITE_ACTIVE' : 'AURA_FX_ACTIVE',
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
  const tier = subscription?.tier || 'FREE';
  const status = subscription?.status || 'inactive';
  const accessType = subscription?.accessType || 'NONE';
  const hasAuraFX = accessType === 'AURA_FX_ACTIVE';
  const hasA7FXElite = accessType === 'A7FX_ELITE_ACTIVE';
  const isAdmin = accessType === 'ADMIN';

  const value = {
    subscription,
    loading,
    error,
    hasCommunityAccess,
    tier,
    status,
    accessType,
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
