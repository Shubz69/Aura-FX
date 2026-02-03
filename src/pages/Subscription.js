import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CosmicBackground from '../components/CosmicBackground';
import axios from 'axios';
import '../styles/Subscription.css';

// Use same origin for API calls to avoid CORS issues
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const STRIPE_PAYMENT_LINK_AURA = process.env.REACT_APP_STRIPE_PAYMENT_LINK_AURA || 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
const STRIPE_PAYMENT_LINK_A7FX = process.env.REACT_APP_STRIPE_PAYMENT_LINK_A7FX || 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';

// Plan configurations
const PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        badge: 'Current',
        price: 0,
        currency: '£',
        period: '/month',
        features: [
            'General chat only',
            'Access to free community content',
            'Create an account and join the conversation'
        ],
        paymentLink: null,
        isElite: false,
        isFree: true
    },
    aura: {
        id: 'aura',
        name: 'Aura FX',
        badge: 'Standard',
        price: 99,
        currency: '£',
        period: '/month',
        features: [
            'Unlimited access to all premium community channels',
            'Network with 1,200+ successful traders',
            'Share and receive exclusive trading strategies',
            'Priority access to premium course content',
            'Exclusive market insights and expert commentary',
            'Weekly Briefs',
            'Premium AURA AI'
        ],
        paymentLink: STRIPE_PAYMENT_LINK_AURA,
        isElite: false
    },
    a7fx: {
        id: 'a7fx',
        name: 'A7FX',
        badge: 'ELITE',
        price: 250,
        currency: '£',
        period: '/month',
        features: [
            'Everything included in Aura FX Standard',
            'Access to exclusive elite trader community',
            'Advanced proprietary trading strategies',
            'Direct communication channel with founders',
            'First access to cutting-edge features and tools',
            'Daily Briefs',
            'Weekly Briefs',
            'Premium AURA AI'
        ],
        paymentLink: STRIPE_PAYMENT_LINK_A7FX,
        isElite: true
    }
};

const Subscription = () => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(10);
    const [subscriptionActivated, setSubscriptionActivated] = useState(false);
    const countdownIntervalRef = useRef(null);
    const [showContactForm, setShowContactForm] = useState(false);
    const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
    const [contactSubmitting, setContactSubmitting] = useState(false);
    const [contactStatus, setContactStatus] = useState(null);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [processingPlan, setProcessingPlan] = useState(null);
    
    // Subscription status from server
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);

    // Fetch subscription status from server
    const fetchSubscriptionStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }

            const response = await axios.get(`${API_BASE_URL}/api/subscription/status`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.success) {
                setSubscriptionStatus(response.data.subscription);
            }
        } catch (err) {
            console.error('Error fetching subscription status:', err);
            // Don't show error - fall back to free state
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check if user is authenticated
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        
        // Fetch subscription status from server (single source of truth)
        fetchSubscriptionStatus();
    }, [isAuthenticated, navigate]);

    // Determine button state for a plan
    const getButtonState = (planId) => {
        if (planId === 'free') {
            return { type: 'current', disabled: true };
        }
        if (!subscriptionStatus) {
            return { type: 'select', disabled: false };
        }

        const currentPlanId = subscriptionStatus.planId;
        const status = subscriptionStatus.status;
        const isActive = subscriptionStatus.isActive;

        // Payment failed - show update payment
        if (subscriptionStatus.paymentFailed) {
            return { type: 'update_payment', disabled: false };
        }

        // User has this exact plan active
        if (currentPlanId === planId && isActive) {
            if (status === 'canceled') {
                return { type: 'active_until', disabled: true };
            }
            return { type: 'current', disabled: true };
        }

        // User has a different plan active
        if (currentPlanId && currentPlanId !== planId && isActive) {
            // Determine if upgrade or downgrade
            const currentPrice = PLANS[currentPlanId]?.price || 0;
            const targetPrice = PLANS[planId]?.price || 0;
            
            if (targetPrice > currentPrice) {
                return { type: 'upgrade', disabled: false };
            } else {
                return { type: 'downgrade', disabled: false };
            }
        }

        // No active subscription - show select
        return { type: 'select', disabled: false };
    };

    // Get button text based on state
    const getButtonText = (planId, buttonState) => {
        if (planId === 'free') return 'GENERAL CHAT ONLY';
        if (processingPlan === planId) {
            return 'PROCESSING...';
        }

        switch (buttonState.type) {
            case 'current':
                return 'CURRENT PLAN';
            case 'active_until':
                return 'ACTIVE UNTIL END';
            case 'update_payment':
                return 'UPDATE PAYMENT';
            case 'upgrade':
                return 'UPGRADE TO THIS PLAN';
            case 'downgrade':
                return 'SWITCH TO THIS PLAN';
            case 'select':
            default:
                return planId === 'a7fx' ? 'SELECT ELITE PLAN' : 'SELECT PLAN';
        }
    };

    // Get status badge for the plan card
    const getStatusBadge = (planId) => {
        if (!subscriptionStatus) return null;

        const currentPlanId = subscriptionStatus.planId;
        const isActive = subscriptionStatus.isActive;

        if (currentPlanId === planId && isActive) {
            if (subscriptionStatus.status === 'canceled') {
                return <div className="plan-status-badge canceled">Canceling</div>;
            }
            if (subscriptionStatus.paymentFailed) {
                return <div className="plan-status-badge past-due">Payment Due</div>;
            }
            return <div className="plan-status-badge active">Your Plan</div>;
        }

        return null;
    };

    // Get renewal/expiry info
    const getRenewalInfo = (planId) => {
        if (!subscriptionStatus) return null;

        const currentPlanId = subscriptionStatus.planId;
        const isActive = subscriptionStatus.isActive;

        if (currentPlanId !== planId || !isActive) return null;

        if (subscriptionStatus.paymentFailed) {
            return (
                <div className="plan-renewal-info past-due">
                    ⚠️ Payment failed. Please update your payment method.
                </div>
            );
        }

        if (subscriptionStatus.status === 'canceled' && subscriptionStatus.expiresAt) {
            const expiryDate = new Date(subscriptionStatus.expiresAt);
            return (
                <div className="plan-renewal-info canceled">
                    Active until {expiryDate.toLocaleDateString('en-GB', { 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric' 
                    })}
                </div>
            );
        }

        if (subscriptionStatus.renewsAt) {
            const renewDate = new Date(subscriptionStatus.renewsAt);
            return (
                <div className="plan-renewal-info active">
                    Renews on {renewDate.toLocaleDateString('en-GB', { 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric' 
                    })}
                    {subscriptionStatus.daysRemaining && (
                        <span className="days-remaining">
                            ({subscriptionStatus.daysRemaining} days remaining)
                        </span>
                    )}
                </div>
            );
        }

        return null;
    };

    const handleSubscribe = (planType = 'aura') => {
        const buttonState = getButtonState(planType);
        
        // Prevent action on disabled buttons
        if (buttonState.disabled) {
            return;
        }

        // Handle update payment
        if (buttonState.type === 'update_payment') {
            // Redirect to Stripe billing portal or contact
            window.open('https://billing.stripe.com/p/login/test', '_blank');
            return;
        }

        setProcessingPlan(planType);
        setSelectedPlan(planType);
        
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = user?.email || storedUser?.email;
        
        const plan = PLANS[planType];
        const paymentLink = userEmail
            ? `${plan.paymentLink}${plan.paymentLink.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=${planType}`
            : `${plan.paymentLink}${plan.paymentLink.includes('?') ? '&' : '?'}plan=${planType}`;

        const redirectPage = `${window.location.origin}/stripe-redirect.html?paymentLink=${encodeURIComponent(paymentLink)}`;
        window.location.assign(redirectPage);
    };

    const handleSkipForNow = () => {
        localStorage.setItem('subscriptionSkipped', 'true');
        navigate('/courses');
    };

    const handleManualRedirect = () => {
        const baseUrl = window.location.origin;
        window.location.replace(`${baseUrl}/community`);
    };

    const handleContactSubmit = async (e) => {
        e.preventDefault();
        setContactSubmitting(true);
        setContactStatus(null);
        
        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/contact`,
                {
                    name: contactForm.name,
                    email: contactForm.email,
                    subject: contactForm.subject || 'Subscription Support Request',
                    message: contactForm.message
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (response.data && response.data.success) {
                setContactStatus({ type: 'success', message: 'Your message has been sent successfully. We will contact you soon.' });
                setContactForm({ name: '', email: '', subject: '', message: '' });
                setTimeout(() => {
                    setShowContactForm(false);
                    setContactStatus(null);
                }, 3000);
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending contact message:', error);
            setContactStatus({ 
                type: 'error', 
                message: 'There was a problem sending your message. Please try again later or email us directly at support@aurafx.com' 
            });
        } finally {
            setContactSubmitting(false);
        }
    };
    
    // Handle successful subscription (called from payment success page or webhook)
    useEffect(() => {
        if (subscriptionActivated) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const paymentSuccess =
            params.get('payment_success') === 'true' ||
            params.get('session_id') ||
            params.get('redirect_status') === 'succeeded';

        const storedUserData = JSON.parse(localStorage.getItem('user') || '{}');
        const activeUserId = user?.id || storedUserData?.id;

        if (paymentSuccess && activeUserId) {
            const activateSubscription = async () => {
                try {
                    setLoading(true);
                    
                    const sessionId = params.get('session_id');
                    const response = await axios.post(
                        `${API_BASE_URL}/api/stripe/subscription-success`,
                        { userId: activeUserId, session_id: sessionId },
                        {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    if (response.data && response.data.success) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        try {
                            const verifyResponse = await axios.get(
                                `${API_BASE_URL}/api/subscription/status`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (verifyResponse.data?.success && verifyResponse.data?.subscription?.isActive) {
                                localStorage.setItem('hasActiveSubscription', 'true');
                                localStorage.removeItem('pendingSubscription');
                                localStorage.removeItem('subscriptionSkipped');
                                
                                const expiryDate = verifyResponse.data.subscription.expiresAt 
                                    ? new Date(verifyResponse.data.subscription.expiresAt)
                                    : (() => {
                                        const date = new Date();
                                        date.setDate(date.getDate() + 90);
                                        return date;
                                    })();
                                
                                localStorage.setItem('subscriptionExpiry', expiryDate.toISOString());
                                
                                setError('');
                                setSubscriptionActivated(true);
                                window.history.replaceState({}, document.title, window.location.pathname);
                                setLoading(false);
                                
                                const baseUrl = window.location.origin;
                                setCountdown(5);
                                
                                let currentCount = 5;
                                countdownIntervalRef.current = setInterval(() => {
                                    currentCount--;
                                    setCountdown(currentCount);
                                    
                                    if (currentCount <= 0) {
                                        if (countdownIntervalRef.current) {
                                            clearInterval(countdownIntervalRef.current);
                                            countdownIntervalRef.current = null;
                                        }
                                        window.location.replace(`${baseUrl}/community`);
                                    }
                                }, 1000);
                                
                                setTimeout(() => {
                                    if (countdownIntervalRef.current) {
                                        clearInterval(countdownIntervalRef.current);
                                        countdownIntervalRef.current = null;
                                    }
                                    window.location.replace(`${baseUrl}/community`);
                                }, 5000);
                            } else {
                                throw new Error('Subscription verification failed');
                            }
                        } catch (verifyError) {
                            console.error('Subscription verification error:', verifyError);
                            setError('Payment processed but subscription verification failed. Please contact support.');
                            setLoading(false);
                        }
                    } else {
                        throw new Error('Failed to activate subscription');
                    }
                } catch (error) {
                    console.error('Error activating subscription:', error);
                    setError('Payment confirmed but failed to activate subscription. Please contact support.');
                    setLoading(false);
                }
            };

            activateSubscription();
        }
        
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        };
    }, [user, subscriptionActivated]);

    if (!isAuthenticated) {
        return null;
    }

    // Render plan card
    const renderPlanCard = (plan) => {
        const buttonState = getButtonState(plan.id);
        const buttonText = getButtonText(plan.id, buttonState);
        const statusBadge = getStatusBadge(plan.id);
        const renewalInfo = getRenewalInfo(plan.id);

        return (
            <div className={`subscription-plan-card ${plan.isElite ? 'elite-plan' : ''} ${buttonState.type === 'current' ? 'current-plan' : ''}`}>
                <div className="plan-header">
                    <h2>{plan.name}</h2>
                    <div className={`plan-badge ${plan.isElite ? 'elite-badge' : ''}`}>
                        {plan.badge}
                    </div>
                    {statusBadge}
                </div>
                <div className="plan-pricing">
                    <span className="plan-price">{plan.currency}{plan.price}</span>
                    <span className="plan-period">{plan.period}</span>
                </div>
                {renewalInfo}
                <div className="plan-benefits">
                    <ul>
                        {plan.features.map((feature, index) => (
                            <li key={index}>✅ {feature}</li>
                        ))}
                    </ul>
                </div>
                <button 
                    className={`plan-select-button ${plan.isElite ? 'elite-button' : ''} ${buttonState.disabled ? 'disabled' : ''} ${buttonState.type}`}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={buttonState.disabled || processingPlan === plan.id}
                >
                    {buttonText}
                </button>
            </div>
        );
    };

    return (
        <div className="subscription-container">
            <CosmicBackground />
            <div className="subscription-card">
                <div className="subscription-header">
                    <h1>🔒 PREMIUM COMMUNITY ACCESS</h1>
                    <p className="subscription-subtitle">Join 1,200+ Elite Traders and Unlock Your Path to Financial Freedom</p>
                </div>

                <div className="subscription-content">
                    {loading ? (
                        <div className="subscription-loading">
                            <div className="loading-spinner"></div>
                            <p>Loading subscription details...</p>
                        </div>
                    ) : (
                        <div className="subscription-plans">
                            {renderPlanCard(PLANS.free)}
                            {renderPlanCard(PLANS.aura)}
                            {renderPlanCard(PLANS.a7fx)}
                        </div>
                    )}
                    <p className="pricing-note" style={{ textAlign: 'center', marginTop: '20px' }}>Cancel anytime • No hidden fees</p>
                </div>

                {error && <div className="subscription-error">{error}</div>}
                
                {subscriptionActivated && !error && (
                    <div className="subscription-success">
                        <h2>✅ Payment Confirmed!</h2>
                        <p>Your subscription has been activated.</p>
                        <p className="redirect-info">
                            Redirecting to community page in <span className="countdown-number">{countdown}</span> seconds...
                        </p>
                        <p className="redirect-warning">
                            ⚠️ If you're not redirected within 10 seconds, click the button below to access the community.
                        </p>
                        <button 
                            className="manual-redirect-button"
                            onClick={handleManualRedirect}
                        >
                            Go to Community Now
                        </button>
                    </div>
                )}

                {!subscriptionStatus?.isActive && (
                    <div className="subscription-actions">
                        <button 
                            className="skip-button"
                            onClick={handleSkipForNow}
                        >
                            Skip for Now
                        </button>
                    </div>
                )}

                {/* Support/Contact Section */}
                <div className="subscription-support">
                    <h3 style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '16px', fontSize: '1.1rem' }}>Need Help?</h3>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Having issues with your subscription or payment? Our support team is available 24/7 to assist you.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button 
                            className="support-button"
                            onClick={() => setShowContactForm(!showContactForm)}
                        >
                            {showContactForm ? 'Hide Contact Form' : 'Contact Support'}
                        </button>
                        <a 
                            href="mailto:support@aurafx.com"
                            className="support-button"
                            style={{ textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}
                        >
                            Email Support
                        </a>
                    </div>

                    {showContactForm && (
                        <div className="contact-form-container">
                            <form onSubmit={handleContactSubmit} className="contact-form">
                                <input
                                    type="text"
                                    placeholder="Your Name"
                                    value={contactForm.name}
                                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                                    required
                                    className="contact-input"
                                />
                                <input
                                    type="email"
                                    placeholder="Your Email"
                                    value={contactForm.email}
                                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                                    required
                                    className="contact-input"
                                />
                                <input
                                    type="text"
                                    placeholder="Subject (optional)"
                                    value={contactForm.subject}
                                    onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                                    className="contact-input"
                                />
                                <textarea
                                    placeholder="Your Message"
                                    value={contactForm.message}
                                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                                    required
                                    rows="4"
                                    className="contact-textarea"
                                />
                                {contactStatus && (
                                    <div className={`contact-status ${contactStatus.type}`}>
                                        {contactStatus.message}
                                    </div>
                                )}
                                <button 
                                    type="submit"
                                    className="contact-submit-button"
                                    disabled={contactSubmitting}
                                >
                                    {contactSubmitting ? 'Sending...' : 'Send Message'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Subscription;
