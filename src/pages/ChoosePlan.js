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
import Api from '../services/Api';

const STRIPE_PAYMENT_LINK_AURA = process.env.REACT_APP_STRIPE_PAYMENT_LINK_AURA || 'https://buy.stripe.com/eVq8wO1MM0PGebBd1TdIA0m';
const STRIPE_PAYMENT_LINK_A7FX = process.env.REACT_APP_STRIPE_PAYMENT_LINK_A7FX || 'https://buy.stripe.com/eVq5kCbnm1TKgjJaTLdIA0l';

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
      // Full-page redirect so the app loads with fresh /api/me and guard sees canAccessCommunity
      window.location.href = `${window.location.origin}/community`;
      return;
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
        <h1 className="courses-title">Courses & subscriptions</h1>
        <p>Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs</p>
      </div>

      <div style={{ marginTop: '40px', marginBottom: '30px' }}>
        <h2
          className="section-title subscriptions-title"
          style={{
            color: '#ffffff',
            fontSize: '36px',
            fontWeight: 'normal',
            marginBottom: '12px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #eaa960 0%, #f8c37d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            padding: '0 20px'
          }}
        >
          💎 Subscriptions
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
        <p
          style={{
            color: 'rgba(255, 255, 255, 0.72)',
            fontSize: '15px',
            marginBottom: '28px',
            textAlign: 'center',
            lineHeight: '1.65',
            maxWidth: '720px',
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: '0 20px'
          }}
        >
          <strong style={{ color: '#eaa960' }}>Reports &amp; broker metrics:</strong>{' '}
          <strong>Premium (AURA TERMINAL)</strong> includes monthly report PDFs — add your MT5 trade history by uploading a CSV on{' '}
          <strong>Performance &amp; DNA</strong> (<code style={{ fontSize: '13px', opacity: 0.9 }}>/reports</code>).{' '}
          <strong>Elite (A7FX)</strong> gets <strong>Aura Analysis</strong> with live, automatic platform metrics (no CSV for analysis), and monthly reports are compiled automatically — no CSV upload.
        </p>

        {error && (
          <div style={{ margin: '0 auto 24px', maxWidth: '600px', padding: '16px', background: 'rgba(130, 118, 108, 0.12)', border: '1px solid rgba(234, 169, 96, 0.35)', borderRadius: '8px', color: '#c4bbb2', textAlign: 'center' }}>
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

          {/* AURA TERMINAL (Premium) */}
          <div className="subscription-plan-card premium">
            <h3 className="subscription-plan-title">AURA TERMINAL</h3>
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
              <li>✅ Monthly Reports — MT5 sections via CSV upload on Monthly Reports (/reports)</li>
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
              <li>✅ Aura Analysis — full platform; live metrics from MT5 (no CSV needed)</li>
              <li>✅ Monthly report PDFs — fully automated (no CSV)</li>
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
