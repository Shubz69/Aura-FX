import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import Chatbot from "../components/Chatbot";
import BinaryBackground from "../components/BinaryBackground";
import FancyAIHead from "../components/FancyAIHead";

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [aiHeadState, setAiHeadState] = useState('idle');
    const [currentFeature, setCurrentFeature] = useState(0);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });


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

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePosition({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);


    const handleStartTrading = () => {
        if (isAuthenticated) {
            navigate("/dashboard");
        } else {
            navigate("/register");
        }
    };

    const handleAiHeadInteraction = (state) => {
        setAiHeadState(state);
        setTimeout(() => setAiHeadState('idle'), 4000);
    };

    const features = [
        {
            icon: "💰",
            title: "8 Wealth Domains",
            description: "Master Health & Fitness, E-Commerce, Forex, Crypto, Algorithmic FX, Intelligent Systems, Social Media, and Real Estate",
            color: "#1E90FF"
        },
        {
            icon: "🚀",
            title: "Multiple Income Streams",
            description: "Build generational wealth through diverse revenue channels and strategic investments",
            color: "#00CED1"
        },
        {
            icon: "📈",
            title: "Proven Results",
            description: "247% average ROI with 15 active income streams - real numbers from real traders",
            color: "#32CD32"
        },
        {
            icon: "🎓",
            title: "Cutting-Edge Knowledge",
            description: "Access comprehensive courses and strategies powered by the latest trading intelligence",
            color: "#FF69B4"
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
                        <div className="loading-title">THE GLITCH</div>
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
                                    <span className="badge-icon">⚡</span>
                                    <span className="badge-text">AI-POWERED TRADING</span>
                                </div>
                                
                                <h1 className="hero-title">
                                    <span className="title-line">WELCOME TO</span>
                                    <span className="title-highlight">THE GLITCH</span>
                                    <span className="title-line">PLATFORM</span>
                                </h1>
                                
                                <p className="hero-description">
                                    Your comprehensive platform for building generational wealth across 8 powerful domains: 
                                    <span className="highlight-text">Health & Fitness</span>, <span className="highlight-text">E-Commerce</span>, 
                                    <span className="highlight-text">Forex</span>, <span className="highlight-text">Crypto</span>, 
                                    <span className="highlight-text">Algorithmic FX</span>, <span className="highlight-text">Intelligent Systems Development</span>, 
                                    <span className="highlight-text">Social Media</span>, and <span className="highlight-text">Real Estate</span>. 
                                    Multiple income streams powered by cutting-edge knowledge.
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
                                <div className="ai-head-wrapper">
                                    <FancyAIHead 
                                        state={aiHeadState}
                                        onInteraction={handleAiHeadInteraction}
                                        mousePosition={mousePosition}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Interactive Features Section */}
                    <section className="features-section">
                        <div className="features-container">
                            <div className="features-header">
                                <h2 className="section-title">Advanced Capabilities</h2>
                                <p className="section-subtitle">Discover what makes THE GLITCH the most advanced trading platform</p>
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
                                <h2 className="wealth-impact-title">WEALTH IMPACT</h2>
                                <p className="wealth-impact-subtitle">Real results across all wealth-building domains</p>
                            </div>
                            
                            <div className="wealth-stats-grid">
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">🎯</div>
                                    <div className="wealth-stat-number">8.00</div>
                                    <div className="wealth-stat-label">WEALTH DOMAINS</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">💰</div>
                                    <div className="wealth-stat-number">247</div>
                                    <div className="wealth-stat-label">% AVG ROI</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                                <div className="wealth-stat-card">
                                    <div className="wealth-stat-icon">📈</div>
                                    <div className="wealth-stat-number">15</div>
                                    <div className="wealth-stat-label">INCOME STREAMS</div>
                                    <div className="wealth-stat-glow"></div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="cta-section">
                        <div className="cta-container">
                            <div className="cta-content">
                                <h2 className="cta-title">Ready to Experience the Future?</h2>
                                <p className="cta-description">Join thousands of traders who trust THE GLITCH for their automated trading needs</p>
                                
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
                                        <span className="trust-icon">🔒</span>
                                        <span>Bank-Level Security</span>
                                    </div>
                                    <div className="trust-item">
                                        <span className="trust-icon">⚡</span>
                                        <span>Lightning Fast</span>
                                    </div>
                                    <div className="trust-item">
                                        <span className="trust-icon">🧠</span>
                                        <span>AI-Powered</span>
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
