import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import Chatbot from "../components/Chatbot";
import BinaryBackground from "../components/BinaryBackground";

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentFeature, setCurrentFeature] = useState(0);


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

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentFeature((prev) => (prev + 1) % 4);
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const handleStartTrading = () => {
        if (isAuthenticated) {
            navigate("/community");
        } else {
            navigate("/register");
        }
    };

    const features = [
        {
            icon: "📈",
            title: "Forex Trading",
            description: "Master currency trading with proven strategies, technical analysis, and risk management techniques",
            color: "#1E90FF"
        },
        {
            icon: "💹",
            title: "Stock Trading",
            description: "Learn to trade stocks, analyze markets, and build a profitable trading portfolio",
            color: "#4169E1"
        },
        {
            icon: "₿",
            title: "Crypto Trading",
            description: "Navigate cryptocurrency markets with advanced strategies and market analysis",
            color: "#00BFFF"
        },
        {
            icon: "🎯",
            title: "1-to-1 Mentorship",
            description: "Get personalized trading guidance from experienced professionals tailored to your goals",
            color: "#1E90FF"
        }
    ];

    return (
        <>
            {/* Loading Screen - Outside container for full viewport coverage */}
            {isLoading && (
                <div className="loading-screen">
                    <BinaryBackground />
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
                <BinaryBackground />
            
            {showContent && (
                <>
                    {/* Main Hero Section */}
                    <section className="hero-section">
                        
                        <div className="hero-content">
                            <div className="hero-left">
                                <div className="hero-badge">
                                    <div className="badge-glow"></div>
                                    <span className="badge-icon">📊</span>
                                    <span className="badge-text">PROFESSIONAL TRADING</span>
                                </div>
                                
                                <h1 className="hero-title">
                                    <span className="title-line">WELCOME TO</span>
                                    <span className="title-highlight">AURA FX</span>
                                    <span className="title-line">TRADING PLATFORM</span>
                                </h1>
                                
                                <p className="hero-description">
                                    Your premier destination for professional trading education. Master 
                                    <span className="highlight-text"> Forex</span>, <span className="highlight-text">Stocks</span>, 
                                    <span className="highlight-text"> Crypto</span>, and <span className="highlight-text">Options Trading</span> 
                                    with expert guidance, proven strategies, and personalized 1-to-1 mentorship. 
                                    Build your trading skills and achieve consistent profitability.
                                </p>
                                
                                <div className="hero-actions">
                                    <button className="primary-button" onClick={handleStartTrading}>
                                        <span className="button-text">Sign Up</span>
                                        <div className="button-particles"></div>
                                        <div className="button-glow"></div>
                                    </button>
                                    <button className="secondary-button" onClick={() => navigate("/explore")}>
                                        <span className="button-text">Explore Features</span>
                                        <span className="button-arrow">→</span>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="hero-right">
                                <div className="trading-visual">
                                    <div className="trading-chart-placeholder">
                                        <div className="chart-line"></div>
                                        <div className="chart-line"></div>
                                        <div className="chart-line"></div>
                                        <div className="chart-glow"></div>
                                    </div>
                                    <div className="trading-stats">
                                        <div className="stat-item">
                                            <span className="stat-value">+24.7%</span>
                                            <span className="stat-label">Avg ROI</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="stat-value">1,200+</span>
                                            <span className="stat-label">Traders</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Interactive Features Section */}
                    <section className="features-section">
                        <div className="features-container">
                            <div className="features-header">
                                <h2 className="section-title">Trading Excellence</h2>
                                <p className="section-subtitle">Master the markets with AURA FX's comprehensive trading education</p>
                            </div>
                            
                            <div className="features-showcase">
                                <div className="feature-display">
                                    <div className="feature-icon-large">
                                        <span>{features[currentFeature].icon}</span>
                                        <div className="icon-aura"></div>
                                    </div>
                                    <div className="feature-info">
                                        <h3 className="feature-title">{features[currentFeature].title}</h3>
                                        <p className="feature-description">{features[currentFeature].description}</p>
                                    </div>
                                </div>
                                
                                <div className="feature-indicators">
                                    {features.map((feature, index) => (
                                        <div 
                                            key={index}
                                            className={`feature-indicator ${index === currentFeature ? 'active' : ''}`}
                                        >
                                            <span className="indicator-icon">{feature.icon}</span>
                                            <span className="indicator-title">{feature.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Wealth Impact Section */}
                    <section className="wealth-impact-section">
                        <div className="wealth-impact-container">
                            <div className="wealth-impact-header">
                                <h2 className="wealth-impact-title">TRADING RESULTS</h2>
                                <p className="wealth-impact-subtitle">Real performance from our trading community</p>
                            </div>
                            
                            <div className="wealth-stats-grid">
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">📈</div>
                                    <div className="wealth-stat-number">24.7</div>
                                    <div className="wealth-stat-label">% AVG ROI</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">👥</div>
                                    <div className="wealth-stat-number">1,200+</div>
                                    <div className="wealth-stat-label">ACTIVE TRADERS</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">🎯</div>
                                    <div className="wealth-stat-number">85%</div>
                                    <div className="wealth-stat-label">SUCCESS RATE</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="cta-section">
                        <div className="cta-container">
                            <div className="cta-content">
                                <h2 className="cta-title">Ready to Start Trading?</h2>
                                <p className="cta-description">Join thousands of successful traders who trust AURA FX for professional trading education</p>
                                
                                <div className="cta-actions">
                                    <button className="cta-primary" onClick={handleStartTrading}>
                                        Get Started Now
                                        <div className="cta-glow"></div>
                                    </button>
                                    <button className="cta-secondary" onClick={() => navigate("/explore")}>
                                        Learn More
                                    </button>
                                </div>
                                
                                <div className="trust-indicators">
                                    <div className="trust-item">
                                        <span className="trust-icon">📚</span>
                                        <span>Expert Education</span>
                                    </div>
                                    <div className="trust-item">
                                        <span className="trust-icon">🎯</span>
                                        <span>Proven Strategies</span>
                                    </div>
                                    <div className="trust-item">
                                        <span className="trust-icon">💼</span>
                                        <span>1-to-1 Mentorship</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}
            <Chatbot />
            </div>
        </>
    );
};

export default Home;
