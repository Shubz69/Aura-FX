/**
 * ChoosePlan - Dedicated plan selection page after signup/login.
 * Blocks community access until a plan is selected.
 * Free: apply instantly (no Stripe), refresh entitlements, redirect to /community.
 * Premium/Elite: redirect to /subscription with plan param.
 * If user already has plan (canAccessCommunity), redirect to /community.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/Subscription.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
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

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { entitlements, loading: entLoading, refresh: refreshEntitlements } = useEntitlements();
  const [processingPlan, setProcessingPlan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) {
      navigate('/signup', { state: { redirectAfter: '/choose-plan' }, replace: true });
      return;
    }
  }, [user, token, navigate]);

  useEffect(() => {
    if (entLoading || !entitlements) return;
    if (entitlements.canAccessCommunity === true) {
      navigate('/community', { replace: true });
    }
  }, [entitlements, entLoading, navigate]);

  const handleSelectFree = async () => {
    if (!token) {
      navigate('/signup', { state: { redirectAfter: '/choose-plan' } });
      return;
    }
    setProcessingPlan('free');
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/subscription/select-free`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          navigate('/signup', { state: { redirectAfter: '/choose-plan' } });
          return;
        }
        throw new Error(data.message || 'Failed to set Free plan');
      }
      if (typeof localStorage !== 'undefined') localStorage.removeItem('community_channels_cache');
      await refreshEntitlements();
      navigate('/community', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleSelectPaid = (planId) => {
    const plan = PLANS[planId];
    if (!plan?.paymentLink) return;
    if (!token) {
      navigate('/signup', { state: { redirectAfter: '/choose-plan' } });
      return;
    }
    navigate(`/subscription?plan=${planId}`, { replace: true });
  };

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
