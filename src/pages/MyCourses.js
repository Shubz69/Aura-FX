import React, { useEffect, useState } from 'react';
import '../styles/MyCourses.css';
import { useNavigate } from 'react-router-dom';
import { FaChevronRight } from 'react-icons/fa';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';

const MyCourses = () => {
    const [courses, setCourses] = useState([]);
    const [userRole, setUserRole] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    
    // Stock ticker data matching the image
    const stockData = [
        { symbol: 'ETH', price: '$2,865.92', change: '+1.8%', isUp: true },
        { symbol: 'AAPL', price: '$187.45', change: '-0.6%', isUp: false },
        { symbol: 'MSFT', price: '$402.17', change: '+1.2%', isUp: true },
        { symbol: 'TSLA', price: '$248.38', change: '-1.4%', isUp: false },
        { symbol: 'AMZN', price: '$182.79', change: '+0.9%', isUp: true },
        { symbol: 'NVDA', price: '$924.67', change: '+3.1%', isUp: true },
        { symbol: 'GOOG', price: '$175.63', change: '+0.5%', isUp: true },
        { symbol: 'META', price: '$481.12', change: '+1.7%', isUp: true },
        { symbol: 'JPM', price: '$197.24', change: '-0.3%', isUp: false },
    ];
    
    useEffect(() => {
        // Get user data from stored user object instead of separate localStorage items
        const userJson = localStorage.getItem("user");
        if (userJson) {
            const user = JSON.parse(userJson);
            setUserRole(user.role);
            fetchCourses(user.id, user.role);
        } else {
            setError('User not authenticated');
            setLoading(false);
        }
    }, []);

    const fetchCourses = async (userId, role) => {
        if (!userId) {
            setError('User ID not available');
            setLoading(false);
            return;
        }
        
        try {
            // Use real API to fetch user's courses
            const response = await Api.getUserCourses(userId);
            
            if (response && response.data) {
                const coursesData = Array.isArray(response.data) ? response.data : response.data.courses || [];
                setCourses(coursesData);
                if (coursesData.length === 0) {
                    setError(null); // Clear error if no courses but API call succeeded
                }
            } else {
                setCourses([]);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching courses:', error);
            // Only show error if it's a real API error, not just empty courses
            if (error.response && error.response.status !== 404) {
                setError('Failed to load courses. Please try again.');
            } else {
                setError(null); // 404 or empty response is fine - just no courses
            }
            setCourses([]);
            setLoading(false);
        }
    };

    const navigateToCourse = (courseId) => {
        // Navigate to the specific course page
        navigate(`/courses/${courseId}`);
    };

    if (loading) {
        return (
            <div className="my-courses-container">
                <CosmicBackground />
                <div className="page-header">
                    <h1 className="page-title">
                        {userRole === "ADMIN" ? "ALL COURSES" : "MY COURSES"}
                    </h1>
                </div>
                <div className="loading-spinner">
                    <div className="loading-text">Loading courses...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="my-courses-container">
            <CosmicBackground />
            <div className="page-header">
                <h1 className="page-title">
                    {userRole === "ADMIN" ? "ALL COURSES" : "MY COURSES"}
                </h1>
            </div>
            
            {/* Stock Ticker */}
            <div className="ticker-container">
                <div className="ticker">
                    {stockData.map((stock, index) => (
                        <div className="ticker-item" key={index}>
                            <strong>{stock.symbol}</strong>
                            <span className="ticker-price">{stock.price}</span>
                            <span className={stock.isUp ? "ticker-up" : "ticker-down"}>
                                {stock.change}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            
            {error && (
                <div className="error-message">
                    <p>{error}</p>
                    <button onClick={() => {
                        const userJson = localStorage.getItem("user");
                        if (userJson) {
                            const user = JSON.parse(userJson);
                            fetchCourses(user.id, user.role);
                        }
                    }} style={{
                        marginTop: '12px',
                        padding: '8px 16px',
                        background: 'rgba(139, 92, 246, 0.8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                    }}>
                        Retry
                    </button>
                </div>
            )}
            
            {!error && (
                <div className="courses-grid">
                    {courses.length > 0 ? (
                        courses.map((course) => (
                            <div key={course.id} className="course-card">
                                <div className="course-content">
                                    <h3 className="course-title">{course.name || course.title}</h3>
                                    <p className="course-description">{course.description || 'No description available'}</p>
                                    <button 
                                        className="course-button" 
                                        onClick={() => navigateToCourse(course.courseId || course.id)}
                                    >
                                        <span>Go to Course</span>
                                        <FaChevronRight />
                                    </button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-courses-message">
                            <p>
                                {userRole === "FREE" 
                                    ? "You need to upgrade to Premium to access courses." 
                                    : userRole === "ADMIN"
                                    ? "No courses available. Courses will appear here once they are added to the system."
                                    : "No courses available at this time. Check back soon for new course offerings."}
                            </p>
                        </div>
                    )}
                </div>
            )}
            
            {userRole === "FREE" && (
                <div className="upgrade-container">
                    <h3>Want access to premium courses?</h3>
                    <p>Upgrade your account to unlock all trading courses and premium features. Start mastering the markets today with our expert-led trading curriculum.</p>
                    <button className="upgrade-btn">Upgrade to Premium</button>
                </div>
            )}
        </div>
    );
};

export default MyCourses;
