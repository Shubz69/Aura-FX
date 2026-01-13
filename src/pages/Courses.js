import React, { useState, useEffect } from 'react';
import '../styles/Courses.css';
import Api from '../services/Api';
import CosmicBackground from '../components/CosmicBackground';

// Fallback API URL
const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || 'https://www.aurafx.com');

const Courses = () => {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
                <h1 className="courses-title">COURSES/SUBSCRIPTIONS</h1>
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
            
            {/* Subscription Management Section */}
            <div style={{
                marginTop: '60px',
                padding: '40px',
                background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
                borderRadius: '16px',
                border: '2px solid rgba(139, 92, 246, 0.3)'
            }}>
                <h2 style={{
                    color: '#ffffff',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    marginBottom: '16px',
                    textAlign: 'center',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}>
                    📦 MANAGE YOUR SUBSCRIPTION
                </h2>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '18px',
                    marginBottom: '40px',
                    textAlign: 'center',
                    lineHeight: '1.6'
                }}>
                    Choose or switch between subscription plans. Cancel anytime, no hidden fees.
                </p>
                
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '24px',
                    marginBottom: '20px'
                }}>
                    {/* Free Plan */}
                    <div style={{
                        padding: '24px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>Free</h3>
                        <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£0</div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', marginBottom: '20px' }}>per month</div>
                        <ul style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px', marginBottom: '20px', paddingLeft: '20px' }}>
                            <li>✅ Access to general channels</li>
                            <li>✅ Basic community features</li>
                            <li>✅ View announcements</li>
                        </ul>
                        <button
                            onClick={() => {
                                // Redirect to subscription page to manage (downgrade to free)
                                window.location.href = '/subscription';
                            }}
                            style={{
                                width: '100%',
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                            }}
                        >
                            Select Free Plan
                        </button>
                    </div>

                    {/* Premium Plan */}
                    <div style={{
                        padding: '24px',
                        background: 'rgba(139, 92, 246, 0.15)',
                        borderRadius: '12px',
                        border: '2px solid rgba(139, 92, 246, 0.4)',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>Aura FX</h3>
                        <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£99</div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', marginBottom: '20px' }}>per month</div>
                        <ul style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px', marginBottom: '20px', paddingLeft: '20px' }}>
                            <li>✅ All free features</li>
                            <li>✅ Premium channels</li>
                            <li>✅ Trading signals</li>
                            <li>✅ Market analysis</li>
                        </ul>
                        <button
                            onClick={() => {
                                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                                const userEmail = storedUser?.email;
                                const STRIPE_PAYMENT_LINK_AURA = 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
                                const paymentLink = userEmail
                                    ? `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=aura`
                                    : `${STRIPE_PAYMENT_LINK_AURA}${STRIPE_PAYMENT_LINK_AURA.includes('?') ? '&' : '?'}plan=aura`;
                                window.location.href = paymentLink;
                            }}
                            style={{
                                width: '100%',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.transform = 'translateY(-2px)';
                                e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.transform = 'translateY(0)';
                                e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                            }}
                        >
                            Select Premium Plan
                        </button>
                    </div>

                    {/* A7FX Elite Plan */}
                    <div style={{
                        padding: '24px',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(167, 139, 250, 0.15) 100%)',
                        borderRadius: '12px',
                        border: '2px solid rgba(139, 92, 246, 0.5)',
                        textAlign: 'center',
                        position: 'relative'
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}>ELITE</div>
                        <h3 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>A7FX Elite</h3>
                        <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#8B5CF6', marginBottom: '8px' }}>£250</div>
                        <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px', marginBottom: '20px' }}>per month</div>
                        <ul style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px', marginBottom: '20px', paddingLeft: '20px' }}>
                            <li>✅ Everything in Premium</li>
                            <li>✅ Elite-only channels</li>
                            <li>✅ 1-to-1 mentorship</li>
                            <li>✅ Exclusive signals</li>
                            <li>✅ Direct founder access</li>
                        </ul>
                        <button
                            onClick={() => {
                                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                                const userEmail = storedUser?.email;
                                const STRIPE_PAYMENT_LINK_A7FX = 'https://buy.stripe.com/8x28wOcrq2XO3wX5zrdIA0k';
                                const paymentLink = userEmail
                                    ? `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=a7fx`
                                    : `${STRIPE_PAYMENT_LINK_A7FX}${STRIPE_PAYMENT_LINK_A7FX.includes('?') ? '&' : '?'}plan=a7fx`;
                                window.location.href = paymentLink;
                            }}
                            style={{
                                width: '100%',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.transform = 'translateY(-2px)';
                                e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.transform = 'translateY(0)';
                                e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
                            }}
                        >
                            Select Elite Plan
                        </button>
                    </div>
                </div>
                
                <p style={{
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: '14px',
                    marginTop: '20px'
                }}>
                    Cancel anytime • No hidden fees • Switch plans anytime
                </p>
            </div>
        </div>
    );
};

export default Courses;
