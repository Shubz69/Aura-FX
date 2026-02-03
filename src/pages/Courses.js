import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Courses.css';
import Api from '../services/Api';
import CosmicBackground from '../components/CosmicBackground';
import { useEntitlements } from '../context/EntitlementsContext';

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

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                console.log('Fetching courses from:', `${API_BASE_URL}/api/courses`);
                const response = await Api.getCourses();
                
                // Handle both array response and object with courses property
                let coursesData = [];
                if (Array.isArray(response.data)) {
                    coursesData = response.data;
                } else if (response.data && Array.isArray(response.data.courses)) {
                    coursesData = response.data.courses;
                } else if (response.data && response.data.success === false && Array.isArray(response.data.courses)) {
                    coursesData = response.data.courses;
                }
                
                // Filter out invalid courses
                coursesData = coursesData.filter(course => course && course.id && course.title);
                setCourses(coursesData);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching courses:', error);
                // Set empty array to prevent map error
                setCourses([]);
                // Show a more user-friendly error message
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
            <div className="courses-header">
                <h1 className="courses-title">COURSES & SUBSCRIPTIONS</h1>
                <p>Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs</p>
            </div>
            
            {error && (
                <div className="courses-error" style={{ 
                    margin: '20px auto', 
                    maxWidth: '600px', 
                    padding: '20px', 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.3)', 
                    borderRadius: '8px',
                    color: '#fff',
                    textAlign: 'center'
                }}>
                    <h2>Oops!</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()} style={{
                        marginTop: '10px',
                        padding: '10px 20px',
                        background: '#6D28D9',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}>Try Again</button>
                </div>
            )}

            {/* SUBSCRIPTIONS SECTION */}
            <div style={{
                marginTop: '40px',
                marginBottom: '30px'
            }}>
                <h2 className="section-title subscriptions-title" style={{
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
                }}>
                    💎 SUBSCRIPTIONS
                </h2>
                <p className="section-description subscriptions-description" style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '18px',
                    marginBottom: '40px',
                    textAlign: 'center',
                    lineHeight: '1.6',
                    padding: '0 20px'
                }}>
                    Choose the perfect plan for your trading journey. Upgrade, downgrade, or cancel anytime.
                </p>
                
                <div className="subscriptions-grid">
                    {/* FREE plan – first in DOM order (mobile: stacks top-to-bottom) */}
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
                        {freePlanError && (
                            <p style={{ color: 'rgba(239, 68, 68, 0.9)', fontSize: '14px', marginBottom: '12px' }}>{freePlanError}</p>
                        )}
                        <button
                            className="subscription-plan-button free"
                            onClick={async () => {
                                setFreePlanError('');
                                setSelectingFreePlan(true);
                                try {
                                    const data = await Api.selectFreePlan();
                                    if (data && data.success) {
                                        await refreshEntitlements();
                                        navigate('/community');
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

                    {/* Aura FX (Premium) – second */}
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
                        <button
                            className="subscription-plan-button premium"
                            onClick={() => {
                                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                                const userEmail = storedUser?.email;
                                const STRIPE_PAYMENT_LINK_AURA = 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
                                const paymentLink = userEmail
                                    ? `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=aura`
                                    : `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}plan=aura`;
                                window.location.href = paymentLink;
                            }}
                        >
                            Select Premium Plan
                        </button>
                    </div>

                    {/* A7FX Elite – third */}
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
                        <button
                            className="subscription-plan-button elite"
                            onClick={() => {
                                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                                const userEmail = storedUser?.email;
                                const STRIPE_PAYMENT_LINK_A7FX = 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';
                                const paymentLink = userEmail
                                    ? `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=a7fx`
                                    : `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}plan=a7fx`;
                                window.location.href = paymentLink;
                            }}
                        >
                            Select Elite Plan
                        </button>
                    </div>
                </div>
                
                <p style={{
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: 'clamp(12px, 2vw, 14px)',
                    marginTop: '20px',
                    padding: '0 20px'
                }}>
                    Cancel anytime • No hidden fees • Switch plans anytime
                </p>
            </div>

            {/* COURSES SECTION */}
            <div style={{
                marginTop: '30px',
                marginBottom: '40px'
            }}>
                <h2 className="section-title courses-section-title" style={{
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
                }}>
                    📚 COURSES
                </h2>
                <p className="section-description courses-section-description" style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '18px',
                    marginBottom: '40px',
                    textAlign: 'center',
                    lineHeight: '1.6',
                    padding: '0 20px'
                }}>
                    Master the Markets with Our Comprehensive, Expert-Led Trading Education Programs
                </p>
                
                <div className="courses-grid">
                    {Array.isArray(courses) && courses.length > 0 ? (
                        courses
                            .filter(course => course && course.id && course.title)
                            .map(course => (
                            <div className="course-card" key={course.id}>
                                <div className="course-image">
                                    {course.imageUrl ? (
                                        <img src={course.imageUrl} alt={course.title || 'Course'} />
                                    ) : (
                                        <div className="placeholder-image">{(course.title && course.title.length > 0) ? course.title.charAt(0).toUpperCase() : '?'}</div>
                                    )}
                                </div>
                                <div className="course-info">
                                    <h3>{(course.title || 'Unnamed Course').toUpperCase()}</h3>
                                    <p className="course-description" style={{ whiteSpace: 'pre-line' }}>{course.description || 'No description available'}</p>
                                    <div className="course-cta">
                                        <span className="coming-soon-badge">
                                            COMING SOON
                                        </span>
                                        <button 
                                            className="enroll-button disabled"
                                            disabled={true}
                                        >
                                            <span>Buy Now</span>
                                            <span className="button-glow"></span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-courses">
                            <h2>NO COURSES AVAILABLE</h2>
                            <p>Check back later for new course offerings.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Courses;
