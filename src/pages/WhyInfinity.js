import React, { useEffect, useState, useRef } from "react";
import "../styles/WhyInfinity.css";
import CosmicBackground from "../components/CosmicBackground";
import { FaChartLine, FaGraduationCap, FaArrowRight, FaUsers, FaLock, FaRocket, FaChartPie } from "react-icons/fa";
import { BiCodeAlt } from 'react-icons/bi';
import { RiStockLine } from 'react-icons/ri';

const WhyInfinity = () => {
    const [visibleSections, setVisibleSections] = useState({
        intro: false,
        features: false,
    });
    
    const sectionRefs = useRef({
        featureBoxes: [],
        additionalFeatures: null,
    });

    // Stock data for ticker
    const stockData = [
        { symbol: 'AAPL', price: '192.53', change: '+2.38', isUp: true },
        { symbol: 'MSFT', price: '426.74', change: '-1.28', isUp: false },
        { symbol: 'GOOGL', price: '183.42', change: '+3.71', isUp: true },
        { symbol: 'AMZN', price: '186.93', change: '+1.26', isUp: true },
        { symbol: 'TSLA', price: '244.18', change: '-5.32', isUp: false },
        { symbol: 'META', price: '484.32', change: '+2.95', isUp: true },
        { symbol: 'NVDA', price: '947.52', change: '+18.67', isUp: true },
        { symbol: 'JPM', price: '201.37', change: '-0.84', isUp: false },
        { symbol: 'V', price: '285.16', change: '+1.24', isUp: true },
        { symbol: 'NFLX', price: '651.42', change: '-3.18', isUp: false },
        { symbol: 'AMD', price: '158.73', change: '+4.26', isUp: true },
        { symbol: 'COIN', price: '216.84', change: '+12.37', isUp: true },
        { symbol: 'ETH', price: '3472.16', change: '+105.21', isUp: true },
        { symbol: 'BTC', price: '64238.75', change: '-342.59', isUp: false }
    ];
    
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
                    <div className="stock-ticker-compact">
                        <div className="ticker">
                            {stockData.concat(stockData).map((stock, index) => (
                                <div key={`${stock.symbol}-${index}`} className="ticker-item">
                                    <span className="ticker-symbol">{stock.symbol}</span>
                                    <span className="ticker-price">{stock.price}</span>
                                    <span className={`ticker-change ${stock.isUp ? 'ticker-up' : 'ticker-down'}`}>
                                        {stock.isUp ? "▲" : "▼"} {stock.change}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </header>

                {/* Main Content - Split Layout */}
                <div className="why-main-content">
                    <div className="why-text-section">
                        <h2 className="why-subtitle">Why Choose AURA FX</h2>
                        <div className="why-divider"></div>
                        <p className="why-text">
                            AURA FX is your pathway to building generational wealth and breaking free from 
                            destructive financial habits. We teach you how to make your money work for you through 
                            multiple streams of knowledge—from smart investing to creating passive income.
                        </p>
                        <p className="why-text">
                            Stop working just for money and start building wealth that lasts. Our comprehensive 
                            courses and community support help you develop disciplined strategies that generate 
                            lasting prosperity without falling into common financial traps.
                        </p>
                        <p className="why-text">
                            Join our community of wealth builders who are creating financial freedom through 
                            smart decision-making. Learn to avoid bad habits, build multiple income streams, 
                            and develop the mindset needed for true generational wealth.
                        </p>
                        <button className="why-cta-button">
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
                            <h3 className="why-feature-title">Wealth Building Knowledge</h3>
                            <p className="why-feature-text">
                                Learn proven strategies to build generational wealth and make your money work for you effectively.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-1'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[1] = el}
                        >
                            <div className="why-feature-icon">
                                <FaGraduationCap />
                            </div>
                            <h3 className="why-feature-title">Break Bad Habits</h3>
                            <p className="why-feature-text">
                                Eliminate destructive financial patterns and develop disciplined money management skills.
                            </p>
                        </div>
                        <div className={`why-feature-card ${visibleSections['feature-2'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.featureBoxes[2] = el}
                        >
                            <div className="why-feature-icon">
                                <FaUsers />
                            </div>
                            <h3 className="why-feature-title">Multiple Income Streams</h3>
                            <p className="why-feature-text">
                                Discover diverse knowledge paths to create lasting financial security and independence.
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
                            <h3>Financial Freedom Path</h3>
                            <p>
                                Learn to make your money work for you through smart investment strategies and passive income creation. Build wealth that lasts for generations.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaLock />
                            </div>
                            <h3>Avoid Financial Traps</h3>
                            <p>
                                Identify and break free from bad financial habits that keep you stuck. Learn disciplined approaches to spending, saving, and investing.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <BiCodeAlt />
                            </div>
                            <h3>Smart Money Strategies</h3>
                            <p>
                                Master the knowledge needed to build multiple income streams through trading, investing, and entrepreneurship on AURA FX platform.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaRocket />
                            </div>
                            <h3>Generational Wealth Building</h3>
                            <p>
                                Create lasting prosperity for your family through proven wealth-building strategies that focus on sustainable growth and smart financial decisions.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaChartPie />
                            </div>
                            <h3>Diverse Knowledge Streams</h3>
                            <p>
                                Access comprehensive education in trading, investing, business building, and passive income—all the tools needed to achieve true financial freedom.
                            </p>
                        </div>
                        
                        <div className="why-platform-feature">
                            <div className="why-platform-icon">
                                <FaUsers />
                            </div>
                            <h3>AURA FX Community</h3>
                            <p>
                                Join like-minded individuals committed to breaking free from financial limitations and building generational wealth through smart, disciplined strategies on AURA FX.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhyInfinity;
