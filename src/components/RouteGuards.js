/**
 * RouteGuards - Single source of truth from /api/me entitlements.
 * No duplicate gating: guards read existing entitlements only.
 * FREE users can enter Community (see only allowlist channels); upgrade prompts only when accessing locked feature.
 */

import React, { useRef, useEffect } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import { useSubscription } from '../context/SubscriptionContext';
import { isSuperAdmin, isAdmin } from '../utils/roles';
import { useReportsEligibility } from '../pages/reports/useReportsEligibility';

// Loading spinner component - shown while waiting for subscription status
const LoadingSpinner = () => {
  const { t } = useTranslation();
  return (
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
        <span style={{ opacity: 0.7, fontSize: '14px' }}>{t('routeGuards.verifyingAccess')}</span>
        <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      </div>
    </div>
  );
};

const GateNotice = ({ title, message, primaryTo, primaryLabel, secondaryTo, secondaryLabel }) => (
  <div style={{
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#fff'
  }}>
    <div style={{
      maxWidth: 560,
      width: '100%',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(234,169,96,0.25)',
      borderRadius: 14,
      padding: '24px'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.2rem' }}>{title}</h2>
      <p style={{ marginTop: 0, marginBottom: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to={primaryTo} style={{ padding: '10px 14px', borderRadius: 10, textDecoration: 'none', background: '#b47830', color: '#fff', fontWeight: 600 }}>
          {primaryLabel}
        </Link>
        {secondaryTo ? (
          <Link to={secondaryTo} style={{ padding: '10px 14px', borderRadius: 10, textDecoration: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
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
  const { t } = useTranslation();
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
    return (
      <GateNotice
        title={t('routeGuards.premiumAiPlanTitle')}
        message={t('routeGuards.premiumAiPlanMessage')}
        primaryTo="/subscription"
        primaryLabel={t('routeGuards.manageSubscription')}
        secondaryTo="/choose-plan"
        secondaryLabel={t('routeGuards.viewPlans')}
      />
    );
  }
  return children;
};

export const ReportsDnaGuard = ({ children }) => {
  const { token } = useAuth();
  const { eligibility, loading, error } = useReportsEligibility(token);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <GateNotice
        title="Could not verify Trader DNA access"
        message={error || 'Please retry in a moment.'}
        primaryTo="/reports"
        primaryLabel="Back to reports"
      />
    );
  }
  const role = (eligibility?.role || '').toLowerCase();
  if (!['elite', 'admin'].includes(role)) {
    return (
      <GateNotice
        title="Trader DNA is gated to Elite"
        message="This route is currently available to Elite and Admin users only."
        primaryTo="/choose-plan"
        primaryLabel="Upgrade to Elite"
        secondaryTo="/reports"
        secondaryLabel="Back to reports"
      />
    );
  }
  return children;
};

export const ManualMetricsGuard = ({ children }) => {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { eligibility, loading, error } = useReportsEligibility(token);
  const superAdminByEmail = isSuperAdmin(user);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <GateNotice
        title={t('routeGuards.manualVerifyFailTitle')}
        message={error || t('routeGuards.retryMoment')}
        primaryTo="/aura-analysis/ai"
        primaryLabel="Back to Connection Hub"
      />
    );
  }
  const role = (eligibility?.role || '').toLowerCase();
  if (!superAdminByEmail && !['premium', 'pro', 'elite', 'admin', 'super_admin', 'superadmin'].includes(role)) {
    return (
      <GateNotice
        title={t('routeGuards.manualPaidTitle')}
        message={t('routeGuards.manualPaidMessage')}
        primaryTo="/choose-plan"
        primaryLabel={t('routeGuards.viewPlans')}
        secondaryTo="/aura-analysis/ai"
        secondaryLabel="Back to Connection Hub"
      />
    );
  }
  return children;
};

/**
 * SurveillanceGuard — Elite-only (same billing rules as Trader DNA). Non-elite → /choose-plan.
 */
export const SurveillanceGuard = ({ children }) => {
  const { user, token, loading: authLoading } = useAuth();
  const { entitlements, loading: entLoading } = useEntitlements();
  const location = useLocation();

  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // Staff + env-listed super admins: same bypass as Community (JWT/seed can lag behind /api/me).
  if (isAdmin(user) || isSuperAdmin(user)) return children;
  if (authLoading || entLoading) {
    return <LoadingSpinner />;
  }
  if (entitlements && entitlements.canAccessSurveillance === false) {
    return (
      <GateNotice
        title="Access restricted"
        message="Surveillance is available on active Elite (or A7FX) billing and to Admin / Super Admin staff. Upgrade your plan to open this terminal, or return home."
        primaryTo="/choose-plan"
        primaryLabel="View plans"
        secondaryTo="/"
        secondaryLabel="Back to home"
      />
    );
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
 * AdminGuard - Staff: DB admin/super_admin or super-admin-by-email (see roles / entitlements).
 */
export const AdminGuard = ({ children }) => {
  const { user, token } = useAuth();
  const location = useLocation();
  
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (!isAdmin(user) && !isSuperAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

/**
 * Shown when a user without Premium/Elite tries to use the Friends tab.
 * Export so AdminInbox can render it inside the messaging layout.
 */
export const FriendsUpgradeRequired = () => {
  const { t } = useTranslation();
  return (
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
    }}
    >
      <div style={{
        maxWidth: 420,
        padding: '32px 28px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(234,169,96,0.25)',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)'
      }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12, letterSpacing: '0.02em' }}>
          {t('routeGuards.friendsPremiumTitle')}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: 24 }}>
          {t('routeGuards.friendsPremiumMessage')}
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
          {t('routeGuards.friendsPremiumCta')}
        </Link>
      </div>
    </div>
  );
};

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
  SurveillanceGuard,
  AuthenticatedGuard,
  AdminGuard,
  InboxGuard,
  ReportsDnaGuard,
  ManualMetricsGuard
};

export default RouteGuards;
