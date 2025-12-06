import React, { useState, useEffect } from 'react';
import '../styles/Courses.css';
import Api from '../services/Api';
import BinaryBackground from '../components/BinaryBackground';

// Fallback API URL
const API_BASE_URL = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || 'https://theglitch.world');

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
                <BinaryBackground />
                <div className="courses-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading courses...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="courses-container">
                <BinaryBackground />
                <div className="courses-error">
                    <h2>Oops!</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>Try Again</button>
                </div>
            </div>
        );
    }

    return (
        <div className="courses-container">
            <BinaryBackground />
            <div className="courses-header">
                <h1 className="courses-title">COURSES</h1>
                <p>Expand your knowledge with our comprehensive trading courses</p>
            </div>
            
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
    );
};

export default Courses;