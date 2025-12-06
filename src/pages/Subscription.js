import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BinaryBackground from '../components/BinaryBackground';
import axios from 'axios';
import '../styles/Subscription.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://www.theglitch.world';
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

    const handleSubscribe = () => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = user?.email || storedUser?.email;
        const paymentLink = userEmail
            ? `${STRIPE_PAYMENT_LINK}${STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}`
            : STRIPE_PAYMENT_LINK;

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
                message: 'There was a problem sending your message. Please try again later or email us directly at support@theglitch.world' 
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
                        // Mark subscription as active in localStorage
                        localStorage.setItem('hasActiveSubscription', 'true');
                        localStorage.removeItem('pendingSubscription');
                        localStorage.removeItem('subscriptionSkipped');
                        
                        // Set subscription expiry from database response or calculate
                        const expiryDate = response.data.subscription?.expiry 
                            ? new Date(response.data.subscription.expiry)
                            : (() => {
                                const date = new Date();
                                date.setDate(date.getDate() + 90); // 3 months free trial
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
                        setCountdown(10);
                        
                        let currentCount = 10;
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
                        
                        // Fallback redirect after 10 seconds
                        setTimeout(() => {
                            if (countdownIntervalRef.current) {
                                clearInterval(countdownIntervalRef.current);
                                countdownIntervalRef.current = null;
                            }
                            window.location.replace(`${baseUrl}/community`);
                        }, 10000);
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
            <BinaryBackground />
            <div className="subscription-card">
                <div className="subscription-header">
                    <h1>🔒 COMMUNITY ACCESS REQUIRED</h1>
                    <p className="subscription-subtitle">Unlock the full THE GLITCH experience</p>
                </div>

                <div className="subscription-content">
                    <div className="subscription-benefits">
                        <h2>What You Get:</h2>
                        <ul>
                            <li>✅ Access to all community channels</li>
                            <li>✅ Real-time trading discussions</li>
                            <li>✅ Connect with expert traders</li>
                            <li>✅ Share strategies and insights</li>
                            <li>✅ Premium course discussions</li>
                            <li>✅ Exclusive VIP content</li>
                        </ul>
                    </div>

                    <div className="subscription-pricing">
                        <div className="pricing-highlight">
                            <span className="pricing-label">First 3 Months</span>
                            <span className="pricing-amount">FREE</span>
                        </div>
                        <div className="pricing-regular">
                            <span className="pricing-label">Then</span>
                            <span className="pricing-amount">£99/month</span>
                        </div>
                        <p className="pricing-note">Cancel anytime • No hidden fees</p>
                    </div>
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
                        className="subscribe-button"
                        onClick={handleSubscribe}
                        disabled={loading}
                    >
                        {loading ? 'PROCESSING...' : 'START FREE TRIAL'}
                    </button>
                    <button 
                        className="skip-button"
                        onClick={handleSkipForNow}
                    >
                        Skip for Now
                    </button>
                </div>

                {/* Support/Contact Section */}
                <div className="subscription-support">
                    <h3 style={{ color: '#8B5CF6', marginBottom: '16px', fontSize: '1.1rem' }}>Need Help?</h3>
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
                            href="mailto:support@theglitch.world"
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
