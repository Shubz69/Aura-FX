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
                        <h2 className="why-subtitle">Built by Traders. For Traders.</h2>
                        <div className="why-divider"></div>
                        <p className="why-text">
                            AURA FX is not another retail trading group. We are a professional trading ecosystem built by a team with over 35 years of combined real market experience. Our education is derived from actual execution, live market examples, and institutional-level analysis—not recycled theory or signal selling. We teach you why price moves, who is driving it, and how professional participants operate.
                        </p>
                        <p className="why-text">
                            We offer structured courses across Forex, Stocks, Crypto, Indices, Futures, and Commodities—each designed to develop the skills required for consistent capital growth. Our proprietary AURA AI is a production-grade financial intelligence system that understands market structure, risk management, position sizing, macro drivers, and technical execution across all asset classes. Elite members receive daily market briefs; Premium members receive weekly intelligence reports.
                        </p>
                        <p className="why-text">
                            AURA FX runs on secure infrastructure with protected data and controlled access. This is a complete trading ecosystem—not a signals service. We emphasise discipline, process, and consistency over shortcuts. If you are a serious trader seeking professional-grade education, institutional thinking, and a community built for long-term profitability, AURA FX is where you belong.
                        </p>
                        <button className="why-cta-button" onClick={() => navigate('/register')}>
                            Apply for Access <FaArrowRight />
                        </button>
                    </div>

                    <div className="why-features-section">
                        <div className={`why-feature-card ${visibleSections['feature-0'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[0] = el}
                        >
                            <div className="why-feature-icon">
                                <FaChartLine />
                            </div>
                            <h3 className="why-feature-title">Institutional-Grade Education</h3>
                            <p className="why-feature-text">
                                Learn how institutions think, manage risk, and execute. Our curriculum covers market structure, order flow, liquidity dynamics, and multi-timeframe analysis used by professional trading desks.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-1'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[1] = el}
                        >
                            <div className="why-feature-icon">
                                <FaGraduationCap />
                            </div>
                            <h3 className="why-feature-title">Risk-First Methodology</h3>
                            <p className="why-feature-text">
                                Position sizing, R-multiples, drawdown management, and capital preservation. We teach the mathematics of risk before strategy—because survival is the foundation of profitability.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-2'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[2] = el}
                        >
                            <div className="why-feature-icon">
                                <FaUsers />
                            </div>
                            <h3 className="why-feature-title">Multi-Asset Coverage</h3>
                            <p className="why-feature-text">
                                Forex, Equities, Indices, Crypto, Futures, and Commodities. One platform, complete market access. Develop edge across asset classes and adapt to any market environment.
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Additional Features Grid */}
                <div 
                    className={`why-additional-features ${visibleSections['additional-features'] ? 'fade-in-up' : ''}`}
                    ref={el => sectionRefs.current.additionalFeatures = el}
                >
                    <h2 className="why-section-heading">The AURA FX Advantage</h2>
                    
                    <div className="why-features-grid">
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <RiStockLine />
                            </div>
                            <h3>AURA AI Intelligence System</h3>
                            <p>
                                Our proprietary AI understands market structure, macro drivers, technical execution, psychology, and position sizing. It responds contextually across all asset classes with institutional-level reasoning—not generic chatbot replies. Fast, accurate, and built for serious traders.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaLock />
                            </div>
                            <h3>Secure Infrastructure</h3>
                            <p>
                                Your data is protected. AURA FX runs on enterprise-grade infrastructure with controlled access, encrypted communications, and secure authentication. We treat your information with the same discipline we apply to trading.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <BiCodeAlt />
                            </div>
                            <h3>35+ Years Combined Experience</h3>
                            <p>
                                Our team has traded through multiple market cycles, volatility regimes, and economic environments. This depth of experience informs every course, every market brief, and every piece of content we produce. No theory—only verified execution.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaRocket />
                            </div>
                            <h3>Daily & Weekly Market Briefs</h3>
                            <p>
                                Elite members receive daily institutional-grade market intelligence. Premium members receive comprehensive weekly reports. Stay informed on macro drivers, key levels, sentiment shifts, and actionable opportunities across global markets.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaChartPie />
                            </div>
                            <h3>Complete Trading Ecosystem</h3>
                            <p>
                                Structured courses, real-time AI analysis, community discussion, and curated market intelligence—all in one platform. AURA FX is not a signals service. We build traders who can operate independently and consistently.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaUsers />
                            </div>
                            <h3>Professional Trader Community</h3>
                            <p>
                                A serious environment for serious traders. Share analysis, discuss market structure, review trades, and engage with professionals who prioritise discipline over hype. Every member is committed to long-term capital growth.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhyInfinity;
