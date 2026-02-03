/**
 * ChoosePlan - Dedicated plan selection page after signup/login.
 * Blocks community access until a plan is selected.
 * Free: apply instantly (no Stripe), refresh entitlements, redirect to /community.
 * Premium/Elite: redirect to /subscription with plan param.
 * If user already has plan (canAccessCommunity), redirect to /community.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/Subscription.css';
import Api from '../services/Api';
const STRIPE_PAYMENT_LINK_AURA = process.env.REACT_APP_STRIPE_PAYMENT_LINK_AURA || 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
const STRIPE_PAYMENT_LINK_A7FX = process.env.REACT_APP_STRIPE_PAYMENT_LINK_A7FX || 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    badge: 'Community access',
    price: 0,
    currency: '£',
    period: '/month',
    features: ['General, Welcome & Announcements only', 'Access to free community content', 'Create an account and join the conversation'],
    paymentLink: null,
    isFree: true
  },
  aura: {
    id: 'aura',
    name: 'Aura FX',
    badge: 'Premium',
    price: 99,
    currency: '£',
    period: '/month',
    features: ['All premium community channels', '1,200+ traders', 'Exclusive strategies', 'Premium AURA AI'],
    paymentLink: STRIPE_PAYMENT_LINK_AURA,
    isElite: false
  },
  a7fx: {
    id: 'a7fx',
    name: 'A7FX',
    badge: 'Elite',
    price: 250,
    currency: '£',
    period: '/month',
    features: ['Everything in Premium', 'Elite trader community', 'Direct founder access', 'Premium AURA AI'],
    paymentLink: STRIPE_PAYMENT_LINK_A7FX,
    isElite: true
  }
};

const PLAN_ALIAS_MAP = {
  free: 'free',
  premium: 'aura',
  aura: 'aura',
  elite: 'a7fx',
  a7fx: 'a7fx'
};

const ChoosePlan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const { entitlements, loading: entLoading, refresh: refreshEntitlements } = useEntitlements();
  const [processingPlan, setProcessingPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) {
      navigate('/signup?next=/choose-plan', { replace: true });
      return;
    }
  }, [user, token, navigate]);

  useEffect(() => {
    if (entLoading || !entitlements) return;
    if (entitlements.canAccessCommunity === true) {
      navigate('/community', { replace: true });
    }
  }, [entitlements, entLoading, navigate]);

  const handleSelectFree = useCallback(async () => {
    if (!token) {
      const nextPath = '/choose-plan?plan=free';
      navigate(`/signup?next=${encodeURIComponent(nextPath)}&plan=free`);
      return;
    }
    setProcessingPlan('free');
    setError('');
    try {
      const data = await Api.selectFreePlan();
      if (!data || data.success !== true) {
        throw new Error(data?.message || 'Failed to set Free plan');
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('community_channels_cache');
      }
      await refreshEntitlements();
      navigate('/community', { replace: true });
    } catch (err) {
      const friendlyMessage = err?.message || 'Something went wrong. Please try again.';
      setError(friendlyMessage);
    } finally {
      setProcessingPlan(null);
    }
  }, [token, navigate, refreshEntitlements]);

  const handleSelectPaid = useCallback(
    (planId, options = {}) => {
      const normalizedPlanKey = (planId || '').toLowerCase();
      const targetPlanId = PLAN_ALIAS_MAP[normalizedPlanKey] || normalizedPlanKey;
      const plan = PLANS[targetPlanId];
      if (!plan) {
        return;
      }
      if (!token) {
        const nextPath = `/choose-plan?plan=${normalizedPlanKey || targetPlanId}`;
        navigate(`/signup?next=${encodeURIComponent(nextPath)}&plan=${normalizedPlanKey || targetPlanId}`);
        return;
      }

      const params = new URLSearchParams({ plan: normalizedPlanKey || targetPlanId });
      if (options.auto) {
        params.set('auto', '1');
      }
      navigate(`/subscription?${params.toString()}`, { replace: options.replace === true });
    },
    [navigate, token]
  );

  useEffect(() => {
    if (!user || !token) {
      return;
    }
    if (processingPlan !== null) {
      return;
    }
    if (entLoading || entitlements?.canAccessCommunity) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const planParam = (params.get('plan') || '').toLowerCase();
    if (!planParam) {
      return;
    }

    const isFreePlan = planParam === 'free';
    if (isFreePlan) {
      handleSelectFree();
    } else if (PLAN_ALIAS_MAP[planParam]) {
      handleSelectPaid(planParam, { auto: true, replace: true });
    } else {
      return;
    }

    params.delete('plan');
    params.delete('auto');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : ''
      },
      { replace: true }
    );
  }, [
    entLoading,
    entitlements?.canAccessCommunity,
    handleSelectFree,
    handleSelectPaid,
    location.pathname,
    location.search,
    navigate,
    processingPlan,
    token,
    user
  ]);

  if (!user || !token) return null;
  if (entLoading) {
    return (
      <div className="subscription-page">
        <CosmicBackground />
        <div className="subscription-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <div style={{ color: '#fff', fontSize: '1rem' }}>Loading...</div>
        </div>
      </div>
    );
  }
  if (entitlements?.canAccessCommunity) return null;

  return (
    <div className="subscription-page">
      <CosmicBackground />
      <div className="subscription-content">
        <h1 className="subscription-title">Choose Your Plan</h1>
        <p className="subscription-subtitle">Select a plan to access the community. Free includes General, Welcome & Announcements only.</p>
        {error && <div className="subscription-error" style={{ marginBottom: '1rem', color: '#f87171' }}>{error}</div>}
        <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>
          {['free', 'aura', 'a7fx'].map((planId) => {
            const plan = PLANS[planId];
            const isFree = planId === 'free';
            return (
              <div key={planId} className="subscription-plan-card" style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="plan-badge" style={{ fontSize: '0.75rem', opacity: 0.9, marginBottom: '0.5rem' }}>{plan.badge}</div>
                <h2 className="plan-name" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{plan.name}</h2>
                <div className="plan-price" style={{ marginBottom: '1rem' }}>
                  <span>{plan.currency}{plan.price}</span>
                  <span style={{ opacity: 0.8 }}>{plan.period}</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, marginBottom: '1.5rem', fontSize: '0.9rem', opacity: 0.9 }}>
                  {plan.features.map((f, i) => <li key={i} style={{ marginBottom: '0.35rem' }}>• {f}</li>)}
                </ul>
                <button
                  type="button"
                  className="subscription-button"
                  disabled={processingPlan !== null}
                  onClick={isFree ? handleSelectFree : () => handleSelectPaid(planId)}
                >
                  {processingPlan === 'free' ? 'Applying...' : isFree ? 'Continue with Free' : `Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
