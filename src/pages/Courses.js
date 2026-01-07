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
                <h1 className="courses-title">PREMIUM TRADING COURSES</h1>
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
            
            {/* A7FX Elite Subscription Upgrade Section */}
            <div style={{
                marginTop: '60px',
                padding: '40px',
                background: 'linear-gradient(135deg, rgba(109, 40, 217, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
                borderRadius: '16px',
                border: '2px solid rgba(139, 92, 246, 0.3)',
                textAlign: 'center'
            }}>
                    <h2 style={{
                    color: '#ffffff',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    marginBottom: '16px',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                }}>
                    ⚡ UPGRADE TO A7FX ELITE
                </h2>
                <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '18px',
                    marginBottom: '32px',
                    lineHeight: '1.6'
                }}>
                    Unlock exclusive elite trading signals, priority 1-to-1 mentorship, and access to our most exclusive community of successful traders
                </p>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '24px',
                    marginBottom: '32px',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            fontSize: '48px',
                            fontWeight: 'bold',
                            color: '#8B5CF6',
                            marginBottom: '8px'
                        }}>$250</div>
                        <div style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '14px'
                        }}>per month</div>
                    </div>
                    <div style={{
                        width: '1px',
                        height: '60px',
                        background: 'rgba(255, 255, 255, 0.2)'
                    }}></div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            fontSize: '24px',
                            fontWeight: 'bold',
                            color: '#ffffff',
                            marginBottom: '8px'
                        }}>Elite Benefits</div>
                        <div style={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '14px'
                        }}>Everything in Aura FX + More</div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                        const userEmail = storedUser?.email;
                        const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/7sY00i9fefKA1oP0f7dIA0j';
                        const paymentLink = userEmail
                            ? `${STRIPE_PAYMENT_LINK}${STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(userEmail)}&plan=a7fx`
                            : `${STRIPE_PAYMENT_LINK}${STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?'}plan=a7fx`;
                        window.location.href = paymentLink;
                    }}
                    style={{
                        background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '16px 48px',
                        borderRadius: '12px',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
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
                    Upgrade to A7FX Elite
                </button>
            </div>
        </div>
    );
};

export default Courses;
