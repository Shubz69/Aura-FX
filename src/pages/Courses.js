import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Api from '../services/Api';
import CosmicBackground from '../components/CosmicBackground';
import { useEntitlements } from '../context/EntitlementsContext';
import useRequireAuthOrRedirect from '../hooks/useRequireAuthOrRedirect';

// Fallback API URL
const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || '');

const Courses = () => {
    const navigate = useNavigate();
    const { refresh: refreshEntitlements } = useEntitlements();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectingFreePlan, setSelectingFreePlan] = useState(false);
    const [freePlanError, setFreePlanError] = useState('');
    const requireAuthOrRedirect = useRequireAuthOrRedirect('/choose-plan');

    const handlePremiumSelection = useCallback(() => {
        if (!requireAuthOrRedirect('/choose-plan?plan=premium')) {
            return;
        }

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = storedUser?.email;
        const STRIPE_PAYMENT_LINK_AURA = 'https://buy.stripe.com/eVq8wO1MM0PGebBd1TdIA0m';
        const paymentLink = userEmail
            ? `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=premium`
            : `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}plan=premium`;
        window.location.href = paymentLink;
    }, [requireAuthOrRedirect]);

    const handleEliteSelection = useCallback(() => {
        if (!requireAuthOrRedirect('/choose-plan?plan=elite')) {
            return;
        }

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userEmail = storedUser?.email;
        const STRIPE_PAYMENT_LINK_A7FX = 'https://buy.stripe.com/eVq5kCbnm1TKgjJaTLdIA0l';
        const paymentLink = userEmail
            ? `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=elite`
            : `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}plan=elite`;
        window.location.href = paymentLink;
    }, [requireAuthOrRedirect]);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                console.log('Fetching courses from:', `${API_BASE_URL}/api/courses`);
                const response = await Api.getCourses();
                
                let coursesData = [];
                if (Array.isArray(response.data)) {
                    coursesData = response.data;
                } else if (response.data && Array.isArray(response.data.courses)) {
                    coursesData = response.data.courses;
                } else if (response.data && response.data.success === false && Array.isArray(response.data.courses)) {
                    coursesData = response.data.courses;
                }
                
                coursesData = coursesData.filter(course => course && course.id && course.title);
                setCourses(coursesData);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching courses:', error);
                setCourses([]);
                if (error.response && error.response.status === 403) {
                    setError('Authentication error. Please log in first or try again later.');
                } else {
                    setError('Failed to load courses. Please try again later.');
                }
                setLoading(false);
            }
        };

        fetchCourses();
    }, []);

    if (loading) {
        return (
            <div className="courses-container">
                <CosmicBackground />
                <div className="courses-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading courses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="courses-container">
            <CosmicBackground />
            
            {/* Header with animated line decoration - No diamond icon */}
            <div className="courses-header">
                <h1 className="courses-title">
                    <span className="line1">Courses &</span>
                    <span className="line2">Subscriptions</span>
                </h1>
                <div className="courses-header-line">
                    <div className="courses-header-dot"></div>
                </div>
                <p>Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs</p>
            </div>
            
            {error && (
                <div className="courses-error">
                    <h2>â„ï¸ System Error</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>
                        Retry Connection
                    </button>
                </div>
            )}

            {/* SUBSCRIPTIONS SECTION */}
            <div className="courses-subscriptions-section">
                <div className="section-header">
                    <h2 className="subscriptions-title">Subscriptions</h2>
                    <p className="subscriptions-description">
                        Choose the perfect plan for your trading journey. Upgrade, downgrade, or cancel anytime.
                    </p>
                </div>
                
                <div className="subscriptions-grid">
                    {/* FREE plan */}
                    <div className="subscription-plan-card free">
                        <h3 className="subscription-plan-title">Free</h3>
                        <div className="subscription-plan-price">Â£0</div>
                        <div className="subscription-plan-period">per month</div>
                        <ul className="subscription-plan-features">
                            <li>Access to general community channels</li>
                            <li>Welcome & announcements channels</li>
                            <li>Community support</li>
                        </ul>
                        {freePlanError && (
                            <p style={{ color: '#f87171', fontSize: '0.75rem', marginBottom: '12px' }}>{freePlanError}</p>
                        )}
                        <button
                            className="subscription-plan-button free"
                            onClick={async () => {
                                if (!requireAuthOrRedirect('/choose-plan?plan=free')) {
                                    return;
                                }
                                setFreePlanError('');
                                setSelectingFreePlan(true);
                                try {
                                    const data = await Api.selectFreePlan();
                                    if (data && data.success) {
                                        await refreshEntitlements();
                                        window.location.href = `${window.location.origin}/community`;
                                        return;
                                    }
                                    setFreePlanError('Could not activate Free plan. Please try again.');
                                } catch (err) {
                                    console.error('Select Free plan error:', err);
                                    setFreePlanError(err.response?.data?.message || 'Could not activate Free plan. Please try again.');
                                } finally {
                                    setSelectingFreePlan(false);
                                }
                            }}
                            disabled={selectingFreePlan}
                        >
                            {selectingFreePlan ? 'Activating...' : 'Select Free Plan'}
                        </button>
                    </div>

                    {/* AURA TERMINAL™ (Premium) */}
                    <div className="subscription-plan-card premium">
                        <h3 className="subscription-plan-title">AURA TERMINAL™</h3>
                        <div className="promotional-pricing">
                            <div className="promo-price">Â£0</div>
                            <div className="promo-text">for the first 2 months</div>
                        </div>
                        <div className="original-pricing">
                            <div className="original-price-strikethrough">Â£99</div>
                            <div className="subscription-plan-period">per month</div>
                        </div>
                        <ul className="subscription-plan-features">
                            <li>Premium channels</li>
                            <li>Market analysis</li>
                            <li>Weekly Briefs</li>
                            <li>Premium AURA AI</li>
                            <li>Advanced trading strategies</li>
                        </ul>
                        <button
                            className="subscription-plan-button premium"
                            onClick={handlePremiumSelection}
                        >
                            Select Premium Plan
                        </button>
                    </div>

                    {/* A7FX Elite */}
                    <div className="subscription-plan-card elite">
                        <div className="elite-badge">ELITE</div>
                        <h3 className="subscription-plan-title">A7FX Elite</h3>
                        <div className="subscription-plan-price">Â£250</div>
                        <div className="subscription-plan-period">per month</div>
                        <ul className="subscription-plan-features">
                            <li>Everything in Premium</li>
                            <li>Elite-only channels</li>
                            <li>Direct founder access</li>
                            <li>Daily Briefs</li>
                            <li>Weekly Briefs</li>
                            <li>Premium AURA AI</li>
                        </ul>
                        <button
                            className="subscription-plan-button elite"
                            onClick={handleEliteSelection}
                        >
                            Select Elite Plan
                        </button>
                    </div>
                </div>
                
                <p style={{
                    textAlign: 'center',
                    color: 'rgba(210, 216, 248, 0.45)',
                    fontSize: '0.7rem',
                    marginTop: '24px',
                    padding: '0 20px',
                    letterSpacing: '0.08em'
                }}>
                    Cancel anytime â€¢ No hidden fees â€¢ Switch plans anytime
                </p>
            </div>

            {/* COURSES SECTION */}
            <div style={{ marginTop: '20px', marginBottom: '20px', width: '100%' }}>
                <div className="section-header">
                    <h2 className="subscriptions-title">Courses</h2>
                    <p className="subscriptions-description">
                        Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs
                    </p>
                </div>
                <div className="courses-error" style={{ marginBottom: '14px' }}>
                    <h2>Course Library Status</h2>
                    <p>Subscription plans are active. Most course tiles are preview placeholders and will unlock as courses are released.</p>
                </div>
                
                <div className="courses-grid">
                    {Array.isArray(courses) && courses.length > 0 ? (
                        courses
                            .filter(course => course && course.id && course.title)
                            .map(course => (
                            <div className="course-card" key={course.id}>
                                <div className="course-image">
                                    {course.imageUrl ? (
                                        <img src={course.imageUrl} alt={course.title || 'Course'} loading="lazy" />
                                    ) : (
                                        <div className="placeholder-image">
                                            {course.title && course.title.length > 0 
                                                ? course.title.charAt(0).toUpperCase() 
                                                : 'ðŸ“˜'}
                                        </div>
                                    )}
                                </div>
                                <div className="course-info">
                                    <h3>{course.title?.toUpperCase() || 'Unnamed Course'}</h3>
                                    <p className="course-description" style={{ whiteSpace: 'pre-line' }}>
                                        {course.description || 'No description available'}
                                    </p>
                                    <div className="course-cta">
                                        <span className="coming-soon-badge">
                                            Coming Soon
                                        </span>
                                        <button 
                                            className="enroll-button disabled"
                                            disabled={true}
                                        >
                                            Enroll
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-courses">
                            <h2>No courses available</h2>
                            <p>Check back later for new course offerings.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Courses;