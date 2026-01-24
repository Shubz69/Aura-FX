import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/WhyInfinity.css";
import CosmicBackground from "../components/CosmicBackground";
import MarketTicker from "../components/MarketTicker";
import { FaChartLine, FaGraduationCap, FaArrowRight, FaUsers, FaLock, FaRocket, FaChartPie } from "react-icons/fa";
import { BiCodeAlt } from 'react-icons/bi';
import { RiStockLine } from 'react-icons/ri';

const WhyInfinity = () => {
    const navigate = useNavigate();
    const [visibleSections, setVisibleSections] = useState({
        intro: false,
        features: false,
    });
    
    const sectionRefs = useRef({
        featureBoxes: [],
        additionalFeatures: null,
    });

    // Market ticker is now handled by the shared MarketTicker component
    
    // Scroll animations
    useEffect(() => {
        const observerCallback = (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.dataset.sectionId;
                    if (id) {
                        setVisibleSections(prev => ({
                            ...prev,
                            [id]: true
                        }));
                    }
                }
            });
        };

        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver(observerCallback, observerOptions);
        
        sectionRefs.current.featureBoxes.forEach((box, index) => {
            if (box) {
                box.dataset.sectionId = `feature-${index}`;
                observer.observe(box);
            }
        });

        if (sectionRefs.current.additionalFeatures) {
            sectionRefs.current.additionalFeatures.dataset.sectionId = 'additional-features';
            observer.observe(sectionRefs.current.additionalFeatures);
        }

        return () => observer.disconnect();
    }, []);

    return (
        <div className="why-container">
            <CosmicBackground />
            
            <div className="content-wrapper">
                {/* Header Section */}
                <header className="why-header">
                    <h1 className="why-main-title">WHY AURA FX</h1>
                    <MarketTicker 
                        compact={true}
                        showTabs={false}
                        showViewAll={true}
                        autoScroll={true}
                    />
                </header>

                {/* Main Content - Split Layout */}
                <div className="why-main-content">
                    <div className="why-text-section">
                        <h2 className="why-subtitle">Why Choose AURA FX</h2>
                        <div className="why-divider"></div>
                        <p className="why-text">
                            AURA FX is a professional trading education platform designed to transform aspiring traders into consistently profitable professionals. We focus exclusively on trading—Forex, Stocks, Crypto, and Futures—with realistic, disciplined approaches that emphasize proper risk management and systematic analysis.
                        </p>
                        <p className="why-text">
                            Trading requires discipline, education, and patience. We don't promise get-rich-quick schemes. Instead, we teach proven strategies, proper risk management, and the psychological discipline needed for long-term trading success. Our community of 1,200+ traders learns together, shares insights, and builds consistent profitability through systematic approaches.
                        </p>
                        <p className="why-text">
                            Success in trading comes from education, practice, and discipline. Our expert mentors have years of real trading experience and teach strategies that work in real market conditions. Join traders who understand that consistent profitability requires time, dedication, and the right education.
                        </p>
                        <button className="why-cta-button" onClick={() => navigate('/register')}>
                            Initialize Trading <FaArrowRight />
                        </button>
                    </div>

                    <div className="why-features-section">
                        <div className={`why-feature-card ${visibleSections['feature-0'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[0] = el}
                        >
                            <div className="why-feature-icon">
                                <FaChartLine />
                            </div>
                            <h3 className="why-feature-title">Professional Trading Education</h3>
                            <p className="why-feature-text">
                                Master institutional-grade trading strategies across Forex, Stocks, Crypto, and Futures. Learn from experts with proven track records in real market conditions.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-1'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[1] = el}
                        >
                            <div className="why-feature-icon">
                                <FaGraduationCap />
                            </div>
                            <h3 className="why-feature-title">Risk Management & Discipline</h3>
                            <p className="why-feature-text">
                                Learn proper risk management, position sizing, and the psychological discipline required for consistent trading success. Avoid common trading mistakes that lead to losses.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-2'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[2] = el}
                        >
                            <div className="why-feature-icon">
                                <FaUsers />
                            </div>
                            <h3 className="why-feature-title">Multiple Trading Markets</h3>
                            <p className="why-feature-text">
                                Trade across Forex, Stocks, Crypto, and Futures markets. Diversify your trading strategies and learn to profit in different market conditions.
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Additional Features Grid */}
                <div 
                    className={`why-additional-features ${visibleSections['additional-features'] ? 'fade-in-up' : ''}`}
                    ref={el => sectionRefs.current.additionalFeatures = el}
                >
                    <h2 className="why-section-heading">Exclusive Platform Features</h2>
                    
                    <div className="why-features-grid">
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <RiStockLine />
                            </div>
                            <h3>Systematic Trading Strategies</h3>
                            <p>
                                Master proven trading methodologies that work in real market conditions. Learn technical analysis, fundamental analysis, and systematic approaches to identify high-probability trading opportunities across all markets.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaLock />
                            </div>
                            <h3>Avoid Trading Mistakes</h3>
                            <p>
                                Learn from common trading errors that cause losses: overtrading, poor risk management, emotional decisions, and lack of discipline. Develop the mindset and habits of successful professional traders.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <BiCodeAlt />
                            </div>
                            <h3>Expert Mentorship</h3>
                            <p>
                                Learn from professional traders with years of real market experience. Get personalized guidance, strategy reviews, and insights from mentors who have achieved consistent profitability in trading.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaRocket />
                            </div>
                            <h3>Realistic Trading Approach</h3>
                            <p>
                                We focus on realistic, achievable trading goals. Trading requires time, education, and discipline. We teach strategies that generate consistent returns through proper risk management and systematic analysis—not unrealistic promises.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaChartPie />
                            </div>
                            <h3>Comprehensive Trading Education</h3>
                            <p>
                                Access in-depth courses covering technical analysis, fundamental analysis, risk management, trading psychology, and market-specific strategies for Forex, Stocks, Crypto, and Futures. Everything you need to become a professional trader.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaUsers />
                            </div>
                            <h3>Thriving Trading Community</h3>
                            <p>
                                Join 1,200+ active traders sharing strategies, market analysis, and insights. Learn from experienced traders, discuss market conditions, and build your trading skills alongside a supportive community of professionals.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhyInfinity;
