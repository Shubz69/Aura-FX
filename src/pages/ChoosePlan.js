/**
 * ChoosePlan - Dedicated plan selection page after signup/login.
 * Blocks community access until a plan is selected.
 * Uses same layout, colours and wording as C & S (Courses) page.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/Courses.css';
import Api from '../services/Api';

const STRIPE_PAYMENT_LINK_AURA = process.env.REACT_APP_STRIPE_PAYMENT_LINK_AURA || 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
const STRIPE_PAYMENT_LINK_A7FX = process.env.REACT_APP_STRIPE_PAYMENT_LINK_A7FX || 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';

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
      navigate(`/signup?next=${encodeURIComponent('/choose-plan?plan=free')}&plan=free`);
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
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  }, [token, navigate, refreshEntitlements]);

  const handleSelectPremium = useCallback(() => {
    if (!token) {
      navigate(`/signup?next=${encodeURIComponent('/choose-plan?plan=premium')}&plan=premium`);
      return;
    }
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userEmail = storedUser?.email;
    const link = userEmail
      ? `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=premium`
      : `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}plan=premium`;
    window.location.href = link;
  }, [token]);

  const handleSelectElite = useCallback(() => {
    if (!token) {
      navigate(`/signup?next=${encodeURIComponent('/choose-plan?plan=elite')}&plan=elite`);
      return;
    }
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userEmail = storedUser?.email;
    const link = userEmail
      ? `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=elite`
      : `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}plan=elite`;
    window.location.href = link;
  }, [token]);

  const handleSelectPaid = useCallback(
    (planId, options = {}) => {
      const normalizedPlanKey = (planId || '').toLowerCase();
      const targetPlanId = PLAN_ALIAS_MAP[normalizedPlanKey] || normalizedPlanKey;
      if (!token) {
        const nextPath = `/choose-plan?plan=${normalizedPlanKey || targetPlanId}`;
        navigate(`/signup?next=${encodeURIComponent(nextPath)}&plan=${normalizedPlanKey || targetPlanId}`);
        return;
      }
      const params = new URLSearchParams({ plan: normalizedPlanKey || targetPlanId });
      if (options.auto) params.set('auto', '1');
      navigate(`/subscription?${params.toString()}`, { replace: options.replace === true });
    },
    [navigate, token]
  );

  useEffect(() => {
    if (!user || !token || processingPlan !== null || entLoading || entitlements?.canAccessCommunity) return;
    const params = new URLSearchParams(location.search);
    const planParam = (params.get('plan') || '').toLowerCase();
    if (!planParam) return;
    if (planParam === 'free') {
      handleSelectFree();
      return;
    }
    if (PLAN_ALIAS_MAP[planParam]) {
      handleSelectPaid(planParam, { auto: true, replace: true });
    }
    params.delete('plan');
    params.delete('auto');
    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [entLoading, entitlements?.canAccessCommunity, handleSelectFree, handleSelectPaid, location.pathname, location.search, navigate, processingPlan, token, user]);

  if (!user || !token) return null;
  if (entLoading) {
    return (
      <div className="courses-container">
        <CosmicBackground />
        <div className="courses-loading">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  if (entitlements?.canAccessCommunity) return null;

  return (
    <div className="courses-container">
      <CosmicBackground />
      <div className="courses-header">
        <h1 className="courses-title">COURSES & SUBSCRIPTIONS</h1>
        <p>Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs</p>
      </div>

      <div style={{ marginTop: '40px', marginBottom: '30px' }}>
        <h2
          className="section-title subscriptions-title"
          style={{
            color: '#ffffff',
            fontSize: '36px',
            fontWeight: 'bold',
            marginBottom: '12px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            padding: '0 20px'
          }}
        >
          💎 SUBSCRIPTIONS
        </h2>
        <p
          className="section-description subscriptions-description"
          style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: '18px',
            marginBottom: '40px',
            textAlign: 'center',
            lineHeight: '1.6',
            padding: '0 20px'
          }}
        >
          Choose the perfect plan for your trading journey. Upgrade, downgrade, or cancel anytime.
        </p>

        {error && (
          <div style={{ margin: '0 auto 24px', maxWidth: '600px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div className="subscriptions-grid">
          {/* Free */}
          <div className="subscription-plan-card free">
            <h3 className="subscription-plan-title">Free</h3>
            <div className="subscription-plan-price">£0</div>
            <div className="subscription-plan-period">per month</div>
            <ul className="subscription-plan-features">
              <li>✅ Access to general community channels only</li>
              <li>✅ Welcome &amp; announcements channels</li>
              <li>❌ No Premium AI</li>
              <li>❌ No Premium or Elite channels</li>
            </ul>
            <button
              className="subscription-plan-button free"
              onClick={handleSelectFree}
              disabled={processingPlan !== null}
            >
              {processingPlan === 'free' ? 'Activating...' : 'Select Free Plan'}
            </button>
          </div>

          {/* Aura FX (Premium) */}
          <div className="subscription-plan-card premium">
            <h3 className="subscription-plan-title">Aura FX</h3>
            <div className="subscription-pricing-container">
              <div className="promotional-pricing">
                <div className="promo-price">£0</div>
                <div className="promo-text">for the first 2 months</div>
              </div>
              <div className="original-pricing">
                <div className="original-price-strikethrough">£99</div>
                <div className="subscription-plan-period">per month</div>
              </div>
            </div>
            <ul className="subscription-plan-features">
              <li>✅ Premium channels</li>
              <li>✅ Market analysis</li>
              <li>✅ Weekly Briefs</li>
              <li>✅ Premium AURA AI</li>
              <li>✅ Advanced trading strategies</li>
            </ul>
            <button className="subscription-plan-button premium" onClick={handleSelectPremium}>
              Select Premium Plan
            </button>
          </div>

          {/* A7FX Elite */}
          <div className="subscription-plan-card elite">
            <div className="elite-badge">ELITE</div>
            <h3 className="subscription-plan-title">A7FX Elite</h3>
            <div className="subscription-plan-price">£250</div>
            <div className="subscription-plan-period">per month</div>
            <ul className="subscription-plan-features">
              <li>✅ Everything in Premium</li>
              <li>✅ Elite-only channels</li>
              <li>✅ Direct founder access</li>
              <li>✅ Daily Briefs</li>
              <li>✅ Weekly Briefs</li>
              <li>✅ Premium AURA AI</li>
            </ul>
            <button className="subscription-plan-button elite" onClick={handleSelectElite}>
              Select Elite Plan
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)', fontSize: 'clamp(12px, 2vw, 14px)', marginTop: '20px', padding: '0 20px' }}>
          Cancel anytime • No hidden fees • Switch plans anytime
        </p>
      </div>
    </div>
  );
};

export default ChoosePlan;
