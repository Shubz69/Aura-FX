import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CosmicBackground from '../components/CosmicBackground';
import axios from 'axios';
import '../styles/Subscription.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://www.aurafx.com';
const STRIPE_PAYMENT_LINK = process.env.REACT_APP_STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';

const Subscription = () => {
    const navigate = useNavigate();
    const { user, isAuthenticated } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(10);
    const [subscriptionActivated, setSubscriptionActivated] = useState(false);
    const countdownIntervalRef = useRef(null);
    const [showContactForm, setShowContactForm] = useState(false);
    const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
    const [contactSubmitting, setContactSubmitting] = useState(false);
    const [contactStatus, setContactStatus] = useState(null);
    const [selectedPlan, setSelectedPlan] = useState(null);

    useEffect(() => {
        // Check if user is authenticated
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        
        // Check if user already has active subscription
        const subscriptionStatus = localStorage.getItem('hasActiveSubscription');
        const subscriptionExpiry = localStorage.getItem('subscriptionExpiry');
        
        if (subscriptionStatus === 'true') {
            const expiryDate = subscriptionExpiry ? new Date(subscriptionExpiry) : null;
            if (expiryDate && expiryDate > new Date()) {
                // Has active subscription - redirect to community
                navigate('/community');
                return;
            }
        }
    }, [isAuthenticated, navigate]);

    const handleSubscribe = (planType = 'aura') => {
        setSelectedPlan(planType);
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = user?.email || storedUser?.email;
        // TODO: Update with actual Stripe payment links for each plan
        const paymentLink = userEmail
            ? `${STRIPE_PAYMENT_LINK}${STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=${planType}`
            : `${STRIPE_PAYMENT_LINK}${STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?'}plan=${planType}`;

        const redirectPage = `${window.location.origin}/stripe-redirect.html?paymentLink=${encodeURIComponent(paymentLink)}`;
        window.location.assign(redirectPage);
    };

    const handleSkipForNow = () => {
        // Allow them to browse but block community access
        // Don't remove pendingSubscription flag so they're reminded on next login
        localStorage.setItem('subscriptionSkipped', 'true');
        navigate('/courses');
    };

    const handleManualRedirect = () => {
        // Force hard redirect to community page immediately
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
                    
                    // Update subscription status in database
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
                        // Wait a moment for database to fully update
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // Verify subscription status from API (all checks must pass)
                        try {
                            const verifyResponse = await axios.get(
                                `${API_BASE_URL}/api/subscription/check`,
                                {
                                    params: { userId: activeUserId },
                                    headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (verifyResponse.data && verifyResponse.data.hasActiveSubscription && !verifyResponse.data.paymentFailed) {
                                // All checks passed - update localStorage
                                localStorage.setItem('hasActiveSubscription', 'true');
                                localStorage.removeItem('pendingSubscription');
                                localStorage.removeItem('subscriptionSkipped');
                                
                                // Set subscription expiry from verified response
                                const expiryDate = verifyResponse.data.expiry 
                                    ? new Date(verifyResponse.data.expiry)
                                    : (() => {
                                        const date = new Date();
                                        date.setDate(date.getDate() + 90); // 3 months
                                        return date;
                                    })();
                                
                                localStorage.setItem('subscriptionExpiry', expiryDate.toISOString());
                                
                                // Show success message
                                setError('');
                                setSubscriptionActivated(true);
                                window.history.replaceState({}, document.title, window.location.pathname);
                                setLoading(false);
                                
                                // Start countdown timer
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
                                        // Force hard redirect to community page
                                        window.location.replace(`${baseUrl}/community`);
                                    }
                                }, 1000);
                                
                                // Fallback redirect after 5 seconds
                                setTimeout(() => {
                                    if (countdownIntervalRef.current) {
                                        clearInterval(countdownIntervalRef.current);
                                        countdownIntervalRef.current = null;
                                    }
                                    window.location.replace(`${baseUrl}/community`);
                                }, 5000);
                            } else {
                                throw new Error('Subscription verification failed - checks did not pass');
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
        } else if (paymentSuccess && !activeUserId) {
            console.log('Payment success detected but user context not ready. Waiting for authentication...');
        }
        
        // Cleanup function
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
            }
        };
    }, [user, subscriptionActivated]);

    if (!isAuthenticated) {
        return null; // Will redirect
    }

    return (
        <div className="subscription-container">
            <CosmicBackground />
            <div className="subscription-card">
                <div className="subscription-header">
                    <h1>🔒 COMMUNITY ACCESS REQUIRED</h1>
                    <p className="subscription-subtitle">Unlock the full AURA FX experience</p>
                </div>

                <div className="subscription-content">
                    <div className="subscription-plans">
                        {/* Aura FX Plan */}
                        <div className="subscription-plan-card">
                            <div className="plan-header">
                                <h2>Aura FX</h2>
                                <div className="plan-badge">Standard</div>
                            </div>
                            <div className="plan-pricing">
                                <span className="plan-price">$99</span>
                                <span className="plan-period">/month</span>
                            </div>
                            <div className="plan-benefits">
                                <ul>
                                    <li>✅ Access to all community channels</li>
                                    <li>✅ Real-time trading discussions</li>
                                    <li>✅ Connect with expert traders</li>
                                    <li>✅ Share strategies and insights</li>
                                    <li>✅ Premium course discussions</li>
                                    <li>✅ Exclusive content access</li>
                                </ul>
                            </div>
                            <button 
                                className="plan-select-button"
                                onClick={() => handleSubscribe('aura')}
                                disabled={loading}
                            >
                                {loading && selectedPlan === 'aura' ? 'PROCESSING...' : 'SELECT PLAN'}
                            </button>
                        </div>

                        {/* A7FX Plan - Elite Only */}
                        <div className="subscription-plan-card elite-plan">
                            <div className="plan-header">
                                <h2>A7FX</h2>
                                <div className="plan-badge elite-badge">ELITE</div>
                            </div>
                            <div className="plan-pricing">
                                <span className="plan-price">$250</span>
                                <span className="plan-period">/month</span>
                            </div>
                            <div className="plan-benefits">
                                <ul>
                                    <li>✅ Everything in Aura FX</li>
                                    <li>✅ Elite-only trading signals</li>
                                    <li>✅ Priority 1-to-1 mentorship</li>
                                    <li>✅ Exclusive elite community</li>
                                    <li>✅ Advanced trading strategies</li>
                                    <li>✅ Direct access to founders</li>
                                    <li>✅ Early access to new features</li>
                                </ul>
                            </div>
                            <button 
                                className="plan-select-button elite-button"
                                onClick={() => handleSubscribe('a7fx')}
                                disabled={loading}
                            >
                                {loading && selectedPlan === 'a7fx' ? 'PROCESSING...' : 'SELECT ELITE PLAN'}
                            </button>
                        </div>
                    </div>
                    <p className="pricing-note" style={{ textAlign: 'center', marginTop: '20px' }}>Cancel anytime • No hidden fees</p>
                </div>

                {error && <div className="subscription-error">{error}</div>}
                
                {/* Show success message when payment is confirmed */}
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

                <div className="subscription-actions">
                    <button 
                        className="skip-button"
                        onClick={handleSkipForNow}
                    >
                        Skip for Now
                    </button>
                </div>

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
