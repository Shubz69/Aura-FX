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
        setSubscription(data.subscription);
      } else {
        setSubscription({
          hasCommunityAccess: false,
          accessType: 'NONE',
          isActive: false,
          status: 'inactive'
        });
      }
    } catch (err) {
      console.error('Subscription fetch error:', err);
      setError(err.message);
      // On error, default to no access for security
      setSubscription({
        hasCommunityAccess: false,
        accessType: 'NONE',
        isActive: false,
        status: 'error'
      });
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
  
  // THE AUTHORITATIVE ACCESS CHECK
  // Only returns true if server confirms hasCommunityAccess
  const hasCommunityAccess = subscription?.hasCommunityAccess === true;
  
  // Access type for routing decisions
  const accessType = subscription?.accessType || 'NONE';
  
  // Check if user has a specific plan active
  const hasAuraFX = accessType === 'AURA_FX_ACTIVE';
  const hasA7FXElite = accessType === 'A7FX_ELITE_ACTIVE';
  const isAdmin = accessType === 'ADMIN';
  
  const value = {
    // State
    subscription,
    loading,
    error,
    
    // Access flags (server-authoritative)
    hasCommunityAccess,
    accessType,
    hasAuraFX,
    hasA7FXElite,
    isAdmin,
    
    // Actions
    refreshSubscription
  };
  
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export default SubscriptionContext;
