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
                            AURA FX is an institutional-grade trading education and intelligence platform built by professional traders, for serious traders. Our team brings together 35+ years of real, live market experience, spanning Forex, Indices, Futures, Stocks, Commodities, and Crypto, with each educator specialising exclusively in their respective market. We are accredited by multiple industry bodies and operate with full transparency. Our work is backed by verifiable proof: real trades, real funded accounts, real results, and real students who have gone on to perform consistently in live market conditions.
                        </p>
                        <p className="why-text">
                            Unlike typical trading communities built around recycled YouTube content or surface-level Twitter analysis, AURA FX operates live. Our trading is broadcast publicly on Twitch, allowing anyone to observe real-time decision-making, execution, and risk management. There is no editing, no cherry-picking, and no post-hoc justification. Only disciplined, professional trading in live market conditions. Everything we teach has been executed, tested, and refined in real markets with real capital at risk.
                        </p>
                        <p className="why-text">
                            We do not train dependency. Our sole objective is to build independent, self-sufficient traders capable of making high-quality decisions without reliance on signals or external confirmation. We place risk management first, followed by execution, and teach traders to operate with the mindset and discipline required for long-term consistency. If you are a serious trader seeking professional-grade education and a community built for sustained profitability, AURA FX is where you belong.
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
                            <h3 className="why-feature-title">Professional Education & Frameworks</h3>
                            <p className="why-feature-text">
                                Our education is built on both strategy and framework, ensuring traders understand not only where opportunities exist, but why markets move. Curriculum covers technical analysis, fundamentals, macro-economics, geopolitics, execution psychology, and position management.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-1'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[1] = el}
                        >
                            <div className="why-feature-icon">
                                <FaGraduationCap />
                            </div>
                            <h3 className="why-feature-title">AURA AI Financial Intelligence</h3>
                            <p className="why-feature-text">
                                AURA AI is not a generic chatbot. It is a financial intelligence system built using deeply coded trading logic, professional frameworks, and real-world market behaviour. It understands risk-to-reward, position sizing, market structure, fundamentals, sentiment, and multi-instrument analysis.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-2'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[2] = el}
                        >
                            <div className="why-feature-icon">
                                <FaUsers />
                            </div>
                            <h3 className="why-feature-title">Daily & Weekly Market Briefs</h3>
                            <p className="why-feature-text">
                                Elite members receive daily market briefs; Premium members receive weekly briefs. Forward-looking intelligence reports prepared by a full analysis team before London and New York sessions, including market bias, trade ideas, and key macro considerations.
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
                            <h3>35+ Years Combined Experience</h3>
                            <p>
                                Our team has traded through multiple market cycles, volatility regimes, and economic environments. Each educator specialises exclusively in their respective market, ensuring every analysis and strategy is delivered by experts who actively trade what they teach. No theory, only verified execution.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaLock />
                            </div>
                            <h3>Live Trading on Twitch</h3>
                            <p>
                                Our trading is broadcast publicly on Twitch, allowing anyone to observe real-time decision-making, execution, and risk management. There is no editing, no cherry-picking, and no post-hoc justification. Only disciplined, professional trading in live market conditions with real capital at risk.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <BiCodeAlt />
                            </div>
                            <h3>Build Independent Traders</h3>
                            <p>
                                We do not train dependency. Our sole objective is to build independent, self-sufficient traders capable of making high-quality decisions without reliance on signals or external confirmation. All courses support traders at every level with a clear progression path for those pursuing one-to-one mentorship.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaRocket />
                            </div>
                            <h3>AI That Adapts Over Time</h3>
                            <p>
                                AURA AI processes real financial data, algorithmic market logic, risk structures, and multi-asset relationships to help traders think more clearly. It adapts over time, recognising that even the best traders evolve through mistakes and refinement. Fast enough to operate during market hours, best used outside live execution.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaChartPie />
                            </div>
                            <h3>Professional Environment & Security</h3>
                            <p>
                                AURA FX is professionally moderated by experienced administrators. Market discussions are structured, separated by asset class, and designed for meaningful learning. All user data and payment information are protected using secure, professional-grade infrastructure ensuring confidentiality and reliability at scale.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaUsers />
                            </div>
                            <h3>Our Commitment</h3>
                            <p>
                                AURA FX exists to create disciplined, profitable traders. With consistent effort, adherence to our frameworks, and professional discipline, traders who fully engage with the platform will develop the skills required to achieve sustained profitability within six months. Not a promise of shortcuts, but a commitment to real growth and real results.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhyInfinity;
