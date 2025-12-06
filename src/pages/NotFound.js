import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/NotFound.css';
import BinaryBackground from '../components/BinaryBackground';

const NotFound = () => {
    const navigate = useNavigate();
    
    // Auto-redirect to courses page after 3 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            navigate('/courses');
        }, 3000);
        
        return () => clearTimeout(timer);
    }, [navigate]);
    
    return (
        <div className="not-found-container">
            <BinaryBackground />
            <div className="not-found-content">
                <div className="error-code">404</div>
                <div className="redirect-message">
                    <div className="redirect-text">Redirecting...</div>
                </div>
                
                <p className="error-message">
                    Taking you back to courses page in a few seconds...
                </p>
                
                <div className="portal-container">
                    <div className="portal-effect"></div>
                    <Link to="/courses" className="return-home-button">
                        Go to Courses
                    </Link>
                </div>
                
            </div>
        </div>
    );
};

export default NotFound;
