/**
 * RouteGuards - Centralized route protection components
 * 
 * STRICT SERVER-AUTHORITATIVE ACCESS CONTROL:
 * 
 * Access Rules:
 * - Community access is unlocked ONLY when user has:
 *   1. Active paid Aura FX subscription (£99/month), OR
 *   2. Active paid A7FX Elite subscription (£250/month), OR
 *   3. Admin role
 * 
 * Routing Rules:
 * - PAID USERS: Always redirect to /community, NEVER show /subscription during sign-in
 * - UNPAID USERS: Always redirect to /subscription, hard-block /community entirely
 * - Paid users can ONLY access /subscription via explicit "?manage=true" query param
 * 
 * Enforcement:
 * - All guards WAIT for subscription status from server before rendering (no flicker)
 * - Guards use hasCommunityAccess from SubscriptionContext (server-authoritative)
 * - Client-side guards are defense-in-depth; server enforces via API middleware
 */

import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// Loading spinner component - shown while waiting for subscription status
const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#0a0a0a',
    color: '#fff'
  }}>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTop: '3px solid #8B5CF6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <span style={{ opacity: 0.7, fontSize: '14px' }}>Verifying access...</span>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  </div>
);

/**
 * CommunityGuard - Protects /community/* routes
 * 
 * STRICT RULES:
 * 1. Requires authentication (valid token)
 * 2. Requires hasCommunityAccess === true (server-authoritative)
 * 3. WAITS for subscription status before rendering (prevents flicker/exposure)
 * 4. Hard-blocks unpaid users - includes direct URLs, refreshes, deep links
 */
export const CommunityGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { hasCommunityAccess, loading: subLoading, accessType } = useSubscription();
  const location = useLocation();
  
  // Log access attempts for debugging
  useEffect(() => {
    if (!authLoading && !subLoading) {
      console.log(`[CommunityGuard] Path: ${location.pathname}, Access: ${hasCommunityAccess}, Type: ${accessType}`);
    }
  }, [location.pathname, hasCommunityAccess, accessType, authLoading, subLoading]);
  
  // Not authenticated -> redirect to login (preserve intended destination)
  if (!user || !token) {
    console.log('[CommunityGuard] No auth - redirecting to /login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // CRITICAL: Wait for BOTH auth AND subscription status before rendering
  // This prevents any flicker or accidental exposure of protected content
  if (authLoading || subLoading) {
    return <LoadingSpinner />;
  }
  
  // STRICT ACCESS CHECK: No community access = hard block
  // This catches: direct URLs, refreshes, deep links, browser history navigation
  if (!hasCommunityAccess) {
    console.log('[CommunityGuard] No access - hard redirect to /subscription');
    return <Navigate to="/subscription" replace />;
  }
  
  // Access granted - render protected content
  return children;
};

/**
 * SubscriptionPageGuard - Protects /subscription route
 * 
 * STRICT RULES:
 * 1. PAID USERS: Auto-redirect to /community (NON-NEGOTIABLE)
 *    - This ensures paid users NEVER see subscription page during sign-in or navigation
 * 2. EXCEPTION: Allow access with ?manage=true query param (explicit "Manage Subscription" action)
 * 3. UNPAID USERS: Show subscription page normally
 * 4. UNAUTHENTICATED: Show subscription page (they can view pricing)
 */
export const SubscriptionPageGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { hasCommunityAccess, loading: subLoading, accessType } = useSubscription();
  const location = useLocation();
  
  // Check if user explicitly wants to manage subscription
  const searchParams = new URLSearchParams(location.search);
  const isManageMode = searchParams.get('manage') === 'true';
  
  // Log access attempts for debugging
  useEffect(() => {
    if (!authLoading && !subLoading && user) {
      console.log(`[SubscriptionPageGuard] Access: ${hasCommunityAccess}, ManageMode: ${isManageMode}`);
    }
  }, [hasCommunityAccess, isManageMode, authLoading, subLoading, user]);
  
  // Not authenticated -> allow access (they can view pricing/plans)
  if (!user || !token) {
    return children;
  }
  
  // Wait for subscription status before making routing decisions
  if (authLoading || subLoading) {
    return <LoadingSpinner />;
  }
  
  // CRITICAL: Paid users should NEVER see subscription page during normal flow
  // This is NON-NEGOTIABLE - it's annoying UX to show subscription to paying users
  // ONLY exception: explicit "Manage Subscription" action via ?manage=true
  if (hasCommunityAccess && !isManageMode) {
    console.log(`[SubscriptionPageGuard] Paid user (${accessType}) - auto-redirect to /community`);
    return <Navigate to="/community" replace />;
  }
  
  // Show subscription page for:
  // - Unpaid users (hasCommunityAccess === false)
  // - Paid users in manage mode (hasCommunityAccess === true && isManageMode === true)
  return children;
};

/**
 * AuthenticatedGuard - Simple auth check (no subscription check)
 * For routes that require login but not subscription (like /leaderboard, /profile)
 */
export const AuthenticatedGuard = ({ children }) => {
  const { user, token } = useAuth();
  const location = useLocation();
  
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

/**
 * AdminGuard - Requires admin role
 */
export const AdminGuard = ({ children }) => {
  const { user, token } = useAuth();
  const location = useLocation();
  
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  const isAdmin = user?.role === 'admin' || 
                  user?.role === 'ADMIN' || 
                  user?.role === 'super_admin' ||
                  user?.email?.toLowerCase() === 'shubzfx@gmail.com';
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

export default {
  CommunityGuard,
  SubscriptionPageGuard,
  AuthenticatedGuard,
  AdminGuard
};
