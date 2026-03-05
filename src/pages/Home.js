import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import MarketTicker from "../components/MarketTicker";
import { FaUsers, FaTrophy, FaGraduationCap, FaRocket, FaShieldAlt, FaClock, FaCoins, FaChartBar, FaChartLine, FaGlobe } from 'react-icons/fa';

// Animated counter hook
const useCountUp = (target, duration = 2000, start = false) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!start) return;
        let startTime = null;
        const isFloat = String(target).includes('.');
        const numericTarget = parseFloat(String(target).replace(/[^0-9.]/g, ''));
        const suffix = String(target).replace(/[0-9.]/g, '');
        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = eased * numericTarget;
            setCount(isFloat ? current.toFixed(1) + suffix : Math.floor(current) + suffix);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [start, target, duration]);
    return count;
};

const StatItem = ({ number, label, fill = '75%' }) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    const animated = useCountUp(number, 1800, visible);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setVisible(true); },
            { threshold: 0.25 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            className={`stat-item${visible ? ' stat-visible' : ''}`}
            ref={ref}
            style={{ '--fill': fill }}
        >
            <div className="stat-number">{visible ? animated : '0'}</div>
            <div className="stat-label">{label}</div>
            <span className="stat-trend">
                <span className="stat-trend-fill" />
            </span>
        </div>
    );
};

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadingTimer = setTimeout(() => {
            setIsLoading(false);
            setShowContent(true);
        }, 3000);
        return () => { clearTimeout(loadingTimer); };
    }, []);

    const handleStartTrading = () => {
        if (isAuthenticated) {
            navigate("/community");
        } else {
            navigate("/register");
        }
    };

    return (
        <>
            {isLoading && (
                <div className="loading-screen">
                    <CosmicBackground />
                    <div className="loading-content">
                        <span className="loading-brand-text">Aura FX</span>
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
                        {/* Hero Section */}
                        <div className="home-logo-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                            <A7Logo />
                            <div className="brand-name-container">
                                <h1 className="brand-name">Aura FX</h1>
                                <p className="powered-by-glitch">powered by <strong>The Glitch</strong></p>
                            </div>

                            {/* Hero tagline + CTA — moved here from bottom */}
                            <div className="content-intro hero-intro">
                                <p className="intro-text">
                                    Transform Your Trading Career with Elite Education and Proven Strategies
                                </p>
                            </div>

                            <div className="home-cta-section hero-cta">
                                <button className="home-cta-button" onClick={handleStartTrading}>
                                    Get Started
                                </button>
                                <button className="home-secondary-button" onClick={() => navigate("/explore")}>
                                    Explore Features
                                </button>
                            </div>
                        </div>

                        {/* Main Content Section */}
                        <div className="home-main-content">

                            {/* Live Market Ticker */}
                            <MarketTicker
                                compact={true}
                                showTabs={false}
                                showViewAll={true}
                                autoScroll={true}
                            />

                            {/* Feature Cards */}
                            <div className="feature-cards-grid">
                                <div className="feature-card">
                                    <div className="feature-icon">📈</div>
                                    <h3 className="feature-title">Forex Trading</h3>
                                    <p className="feature-description">
                                        Dominate currency markets with institutional-grade strategies and live market analysis
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">💹</div>
                                    <h3 className="feature-title">Stock Trading</h3>
                                    <p className="feature-description">
                                        Master equity markets with advanced analysis techniques and professional trading strategies
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">₿</div>
                                    <h3 className="feature-title">Crypto Trading</h3>
                                    <p className="feature-description">
                                        Capitalize on digital asset opportunities with cutting-edge strategies and market insights
                                    </p>
                                </div>
                                <div className="feature-card">
                                    <div className="feature-icon">🎯</div>
                                    <h3 className="feature-title">1-to-1 Mentorship</h3>
                                    <p className="feature-description">
                                        Accelerate your success with personalized coaching from industry-leading trading experts
                                    </p>
                                </div>
                            </div>

                            {/* Stats Section */}
                            <div className="stats-section">
                                <div className="stats-grid">
                                    <StatItem number="24.7%" label="Average ROI"     fill="82%" />
                                    <StatItem number="1,200+" label="Active Traders" fill="90%" />
                                    <StatItem number="85%"   label="Success Rate"   fill="85%" />
                                    <StatItem number="50+"   label="Expert Courses" fill="60%" />
                                </div>
                            </div>

                            {/* Why Choose Section */}
                            <div className="why-choose-section">
                                <h2 className="section-title">Why Choose AURA FX</h2>
                                <div className="why-grid">
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Elite Education</h3>
                                        <p className="why-text">Learn from world-class professionals with decades of combined trading expertise</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Proven Strategies</h3>
                                        <p className="why-text">Access battle-tested trading methodologies that generate consistent profits</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">24/7 Support</h3>
                                        <p className="why-text">Receive instant assistance from our thriving community and dedicated expert mentors</p>
                                    </div>
                                    <div className="why-item">
                                        <div className="why-icon">✓</div>
                                        <h3 className="why-title">Comprehensive Resources</h3>
                                        <p className="why-text">Unlock unlimited access to our extensive library of premium courses, advanced tools, and exclusive trading materials</p>
                                    </div>
                                </div>
                            </div>

                            {/* Trade Multiple Markets */}
                            <div className="trade-markets-section">
                                <h2 className="trade-markets-section__title">Trade Multiple Markets</h2>
                                <div className="trade-markets-section__grid">
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaChartLine /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Forex</h3>
                                            <p className="trade-markets-section__card-desc">Major, minor, and exotic currency pairs</p>
                                        </div>
                                    </div>
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaGlobe /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Futures</h3>
                                            <p className="trade-markets-section__card-desc">Master futures contracts and commodity trading</p>
                                        </div>
                                    </div>
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaRocket /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Crypto</h3>
                                            <p className="trade-markets-section__card-desc">Bitcoin, Ethereum, and altcoins</p>
                                        </div>
                                    </div>
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaTrophy /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Stocks</h3>
                                            <p className="trade-markets-section__card-desc">US and international equity markets</p>
                                        </div>
                                    </div>
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaChartBar /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Indices</h3>
                                            <p className="trade-markets-section__card-desc">S&P 500, NASDAQ, and more</p>
                                        </div>
                                    </div>
                                    <div className="trade-markets-section__card">
                                        <div className="trade-markets-section__icon"><FaCoins /></div>
                                        <div className="trade-markets-section__card-body">
                                            <h3 className="trade-markets-section__card-title">Commodities</h3>
                                            <p className="trade-markets-section__card-desc">Trade gold, oil, and valuable resources</p>
                                        </div>
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
                                            <h3 className="feature-item-title">Bank-Level Security</h3>
                                            <p className="feature-item-text">Your data and privacy are safeguarded with military-grade encryption and enterprise security protocols</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaClock /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">24/7 Premium Support</h3>
                                            <p className="feature-item-text">Access round-the-clock assistance from our expert support team, available whenever you need guidance</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaUsers /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">Thriving Community</h3>
                                            <p className="feature-item-text">Join over 1,200+ active traders sharing exclusive insights, strategies, and real-time market analysis</p>
                                        </div>
                                    </div>
                                    <div className="feature-item">
                                        <div className="feature-icon"><FaGraduationCap /></div>
                                        <div className="feature-content">
                                            <h3 className="feature-item-title">Elite Mentors</h3>
                                            <p className="feature-item-text">Learn directly from industry legends with verified track records of consistent profitability and market success</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default Home;