import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import Chatbot from "../components/Chatbot";
import CosmicBackground from "../components/CosmicBackground";
import AuraLogo from "../components/AuraLogo";
import { FaChartLine, FaUsers, FaTrophy, FaGraduationCap, FaRocket, FaShieldAlt, FaClock, FaGlobe } from 'react-icons/fa';

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Loading effect
    useEffect(() => {
        // Prevent scrolling during loading and add class
        if (isLoading) {
            document.body.style.overflow = 'hidden';
            document.body.classList.add('loading-active');
        } else {
            document.body.style.overflow = 'unset';
            document.body.classList.remove('loading-active');
        }

        const loadingTimer = setTimeout(() => {
            setIsLoading(false);
            setTimeout(() => {
                setShowContent(true);
            }, 500); // Small delay for smooth transition
        }, 3000); // 3 second loading screen

        return () => {
            clearTimeout(loadingTimer);
            document.body.style.overflow = 'unset';
            document.body.classList.remove('loading-active');
        };
    }, [isLoading]);

    const handleStartTrading = () => {
        if (isAuthenticated) {
            navigate("/community");
        } else {
            navigate("/register");
        }
    };

    return (
        <>
            {/* Loading Screen */}
            {isLoading && (
                <div className="loading-screen">
                    <CosmicBackground />
                    {/* Main Loading Content */}
                    <div className="loading-content">
                        <div className="loading-title">AURA FX</div>
                        <div className="loading-subtitle">INITIALIZING SYSTEM...</div>
                        
                        <div className="loading-dots-container">
                            <span className="loading-dot"></span>
                            <span className="loading-dot"></span>
                            <span className="loading-dot"></span>
                        </div>
                    </div>
                </div>
            )}

            <div className="home-container">
                <CosmicBackground />
                <div className="central-glow"></div>
            
                {showContent && (
                    <div className="home-content">
                        {/* Logo at Top Center */}
                        <div className="home-logo-section">
                            <AuraLogo />
                        </div>

                        {/* Brand Name - Styled exactly as shown */}
                        <div className="brand-name-container">
                            <h1 className="brand-name">AURA FX</h1>
                        </div>

                        {/* Main Content Section */}
                        <div className="home-main-content">
                            <div className="content-intro">
                                <p className="intro-text">
                                    Professional trading education for the modern trader
                                </p>
                            </div>

                            {/* Feature Cards */}
                            <div className="feature-cards-grid">
                                <div className="feature-card">
                                    <div className="feature-icon">📈</div>
                                    <h3 className="feature-title">Forex Trading</h3>
                                    <p className="feature-description">
                                        Master currency markets with proven strategies and real-time analysis
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">💹</div>
                                    <h3 className="feature-title">Stock Trading</h3>
                                    <p className="feature-description">
                                        Learn to analyze and trade stocks effectively with expert guidance
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">₿</div>
                                    <h3 className="feature-title">Crypto Trading</h3>
                                    <p className="feature-description">
                                        Navigate cryptocurrency markets with confidence and precision
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">🎯</div>
                                    <h3 className="feature-title">1-to-1 Mentorship</h3>
                                    <p className="feature-description">
                                        Get personalized guidance from experienced trading professionals
                                    </p>
                                </div>
                            </div>

                            {/* Stats Section */}
                            <div className="stats-section">
                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <div className="stat-number">24.7%</div>
                                        <div className="stat-label">Average ROI</div>
                                    </div>
                                    <div className="stat-item">
                                        <div className="stat-number">1,200+</div>
                                        <div className="stat-label">Active Traders</div>
                                    </div>
                                    <div className="stat-item">
                                        <div className="stat-number">85%</div>
                                        <div className="stat-label">Success Rate</div>
                                    </div>
                                    <div className="stat-item">
                                        <div className="stat-number">50+</div>
                                        <div className="stat-label">Expert Courses</div>
                                    </div>
                                </div>
                            </div>

                            {/* Why Choose Section */}
                            <div className="why-choose-section">
                                <h2 className="section-title">Why Choose AURA FX</h2>
                                <div className="why-grid">
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Expert Education</h3>
                                        <p className="why-text">Learn from industry professionals with years of trading experience</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Proven Strategies</h3>
                                        <p className="why-text">Access tested trading strategies that deliver consistent results</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Real-Time Support</h3>
                                        <p className="why-text">Get instant help from our community and expert mentors</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Comprehensive Resources</h3>
                                        <p className="why-text">Access extensive library of courses, tools, and trading materials</p>
                                    </div>
                                </div>
                            </div>

                            {/* Trading Markets Section */}
                            <div className="trading-markets-section">
                                <h2 className="section-title">Trade Multiple Markets</h2>
                                <div className="markets-grid">
                                    <div className="market-item">
                                        <div className="market-icon"><FaChartLine /></div>
                                        <h3 className="market-title">Forex</h3>
                                        <p className="market-description">Major, minor, and exotic currency pairs</p>
                                    </div>
                                    <div className="market-item">
                                        <div className="market-icon"><FaTrophy /></div>
                                        <h3 className="market-title">Stocks</h3>
                                        <p className="market-description">US and international equity markets</p>
                                    </div>
                                    <div className="market-item">
                                        <div className="market-icon"><FaRocket /></div>
                                        <h3 className="market-title">Crypto</h3>
                                        <p className="market-description">Bitcoin, Ethereum, and altcoins</p>
                                    </div>
                                    <div className="market-item">
                                        <div className="market-icon"><FaGlobe /></div>
                                        <h3 className="market-title">Options</h3>
                                        <p className="market-description">Advanced options trading strategies</p>
                                    </div>
                                </div>
                            </div>

                            {/* Key Features Section */}
                            <div className="key-features-section">
                                <h2 className="section-title">What Sets Us Apart</h2>
                                <div className="features-list">
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaShieldAlt /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">Secure Platform</h3>
                                            <p className="feature-item-text">Your data and privacy are protected with enterprise-grade security</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaClock /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">24/7 Support</h3>
                                            <p className="feature-item-text">Get help whenever you need it from our dedicated support team</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaUsers /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">Active Community</h3>
                                            <p className="feature-item-text">Connect with thousands of traders sharing insights and strategies</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaGraduationCap /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">Expert Mentors</h3>
                                            <p className="feature-item-text">Learn from professionals with proven track records in trading</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CTA Section */}
                            <div className="home-cta-section">
                                <button className="home-cta-button" onClick={handleStartTrading}>
                                    Get Started
                                </button>
                                <button className="home-secondary-button" onClick={() => navigate("/explore")}>
                                    Explore Features
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                <Chatbot />
            </div>
        </>
    );
};

export default Home;
