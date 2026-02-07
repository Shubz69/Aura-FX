/**
 * RouteGuards - Single source of truth from /api/me entitlements.
 * No duplicate gating: guards read existing entitlements only.
 * FREE users can enter Community (see only allowlist channels); upgrade prompts only when accessing locked feature.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
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
 * CommunityGuard - Protects /community/* routes.
 * Unauthenticated → redirect to /signup (not login). No plan selected → /choose-plan.
 * FREE users with plan selected see only allowlist channels; server enforces.
 */
export const CommunityGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { entitlements, loading: entLoading } = useEntitlements();
  const location = useLocation();

  if (!user || !token) {
    return <Navigate to="/signup" state={{ from: location, redirectAfter: '/choose-plan' }} replace />;
  }
  if (authLoading || entLoading) {
    return <LoadingSpinner />;
  }
  if (entitlements && entitlements.canAccessCommunity === false) {
    return <Navigate to="/choose-plan" replace />;
  }
  return children;
};

/**
 * SubscriptionPageGuard - Protects /subscription route.
 * No plan selected → redirect to /choose-plan. Premium/Elite (or trialing) → /community unless ?manage=true.
 */
export const SubscriptionPageGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { entitlements, loading: entLoading } = useEntitlements();
  const location = useLocation();
  const isManageMode = new URLSearchParams(location.search).get('manage') === 'true';

  if (!user || !token) return children;
  if (authLoading || entLoading) return <LoadingSpinner />;
  if (entitlements && entitlements.canAccessCommunity === false) {
    return <Navigate to="/choose-plan" replace />;
  }
  const paidTier = entitlements?.tier === 'PREMIUM' || entitlements?.tier === 'ELITE';
  if (paidTier && !isManageMode) return <Navigate to="/community" replace />;
  return children;
};

/**
 * PremiumAIGuard - Requires canAccessAI from entitlements (PREMIUM/ELITE/ADMIN).
 * FREE users redirect to /subscription when trying to access /premium-ai.
 */
export const PremiumAIGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { entitlements, loading: entLoading } = useEntitlements();
  const location = useLocation();

  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (authLoading || entLoading) {
    return <LoadingSpinner />;
  }
  if (entitlements && entitlements.canAccessAI === false) {
    return <Navigate to="/subscription" replace />;
  }
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
  
  const role = (user?.role || '').toString().toLowerCase();
  const isAdmin = role === 'admin' || role === 'super_admin' ||
                  user?.email?.toLowerCase() === 'shubzfx@gmail.com';
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

const RouteGuards = {
  CommunityGuard,
  SubscriptionPageGuard,
  AuthenticatedGuard,
  AdminGuard
};

export default RouteGuards;
