/**
 * RouteGuards - Centralized route protection components
 * 
 * STRICT ACCESS CONTROL:
 * - CommunityGuard: Requires active paid subscription
 * - SubscriptionPageGuard: Redirects paid users to /community
 * - All guards wait for subscription status before rendering (no flicker)
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

// Loading spinner component
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
 * Rules:
 * - Requires authentication
 * - Requires hasCommunityAccess === true (server-authoritative)
 * - Waits for subscription status before rendering
 * - Redirects unpaid users to /subscription
 */
export const CommunityGuard = ({ children }) => {
  const { user, token } = useAuth();
  const { hasCommunityAccess, loading } = useSubscription();
  const location = useLocation();
  
  // Not authenticated -> login
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Still loading subscription status -> show spinner (prevents flicker)
  if (loading) {
    return <LoadingSpinner />;
  }
  
  // No community access -> subscription page
  if (!hasCommunityAccess) {
    return <Navigate to="/subscription" replace />;
  }
  
  // Has access -> render children
  return children;
};

/**
 * SubscriptionPageGuard - Protects /subscription route
 * 
 * Rules:
 * - If user is authenticated AND has community access -> redirect to /community
 * - Only show subscription page to unpaid users
 * - Exception: Allow access if explicitly navigating via "Manage Subscription" (query param)
 */
export const SubscriptionPageGuard = ({ children }) => {
  const { user, token } = useAuth();
  const { hasCommunityAccess, loading } = useSubscription();
  const location = useLocation();
  
  // Check if user explicitly wants to manage subscription
  const searchParams = new URLSearchParams(location.search);
  const isManageMode = searchParams.get('manage') === 'true';
  
  // Not authenticated -> allow access to subscription page (they can see pricing)
  if (!user || !token) {
    return children;
  }
  
  // Still loading subscription status -> show spinner
  if (loading) {
    return <LoadingSpinner />;
  }
  
  // Has community access AND not in manage mode -> redirect to community
  // This is NON-NEGOTIABLE: paid users should never see subscription page during normal flow
  if (hasCommunityAccess && !isManageMode) {
    return <Navigate to="/community" replace />;
  }
  
  // No access OR in manage mode -> show subscription page
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
