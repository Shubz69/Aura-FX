/**
 * RouteGuards - Single source of truth from /api/me entitlements.
 * No duplicate gating: guards read existing entitlements only.
 * FREE users can enter Community (see only allowlist channels); upgrade prompts only when accessing locked feature.
 */

import React, { useRef, useEffect } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { isSuperAdmin, isAdmin } from '../utils/roles';

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
        borderTop: '3px solid #eaa960',
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
  const { entitlements, loading: entLoading, refresh } = useEntitlements();
  const location = useLocation();
  const refreshedOnceForCommunity = useRef(false);

  useEffect(() => {
    if (!entitlements || entitlements.canAccessCommunity !== false) return;
    if (refreshedOnceForCommunity.current) return;
    refreshedOnceForCommunity.current = true;
    refresh();
  }, [entitlements, refresh]);

  if (!user || !token) {
    return <Navigate to="/signup" state={{ from: location, redirectAfter: '/choose-plan' }} replace />;
  }

  // Staff always have access — skip entitlements loading (JWT USER + wrong casing must not block)
  if (isAdmin(user) || isSuperAdmin(user)) return children;

  if (authLoading || entLoading) {
    return <LoadingSpinner />;
  }
  if (entitlements && entitlements.canAccessCommunity === false) {
    if (!refreshedOnceForCommunity.current) {
      return <LoadingSpinner />;
    }
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
  const tier = entitlements?.tier;
  const paidTier =
    tier === 'PRO' ||
    tier === 'PREMIUM' ||
    tier === 'ELITE' ||
    tier === 'A7FX';
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
  
  if (!isAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

/**
 * Shown when a user without Premium/Elite tries to use the Friends tab.
 * Export so AdminInbox can render it inside the messaging layout.
 */
export const FriendsUpgradeRequired = () => (
  <div style={{
    minHeight: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    background: 'transparent',
    color: '#fff',
    textAlign: 'center',
    fontFamily: "'Space Grotesk', sans-serif"
  }}>
    <div style={{
      maxWidth: 420,
      padding: '32px 28px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(234,169,96,0.25)',
      borderRadius: 16,
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)'
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, letterSpacing: '0.02em' }}>
        Friends messaging is a premium feature
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: 24 }}>
        You have to buy Premium or Elite to use this feature.
      </p>
      <Link
        to="/subscription"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #b47830 0%, #f8c37d 100%)',
          color: '#fff',
          borderRadius: 10,
          fontWeight: 600,
          textDecoration: 'none',
          fontSize: '0.9rem'
        }}
      >
        View Premium & Elite plans
      </Link>
    </div>
  </div>
);

/**
 * InboxGuard - Allows all authenticated users. Admin tab (message admin) is for everyone;
 * Friends tab is gated inside AdminInbox (Premium/Elite/Admin only).
 */
export const InboxGuard = ({ children }) => {
  const { user, token } = useAuth();
  const location = useLocation();

  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const RouteGuards = {
  CommunityGuard,
  SubscriptionPageGuard,
  AuthenticatedGuard,
  AdminGuard,
  InboxGuard
};

export default RouteGuards;
