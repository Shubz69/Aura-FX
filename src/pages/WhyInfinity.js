import React, { useEffect, useState, useRef } from "react";
import "../styles/WhyInfinity.css";
import BinaryBackground from "../components/BinaryBackground";
import { FaChartLine, FaGraduationCap, FaArrowRight, FaUsers, FaLock } from "react-icons/fa";
// Unused icons commented out to fix ESLint warnings
// import { FaRobot, FaGlobe, FaServer, FaShieldAlt, FaMobileAlt } from "react-icons/fa";
// import { HiChip, HiLightningBolt } from "react-icons/hi";
import { BiCodeAlt } from 'react-icons/bi';
import { RiStockLine } from 'react-icons/ri';
import { FaRocket, FaChartPie } from 'react-icons/fa';

const WhyInfinity = () => {
    const [visibleSections, setVisibleSections] = useState({
        intro: false,
        chart: false,
        features: false,
    });
    
    const sectionRefs = useRef({
        paragraphSections: [],
        featureBoxes: [],
        chartVisual: null,
        additionalFeatures: null,
        featureCards: []
    });

    // Updated stock data for ticker with more realistic values
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

    // Enhanced SVG paths for feature boxes with more complex patterns
    // Commented out unused variable to fix ESLint warning
    // const featureChartPaths = [
    //     'M0,40 Q10,10 20,30 T40,20 T60,40 T80,30 T100,40 T120,20 T140,40 T160,10 T180,30 T200,40',
    //     'M0,30 C10,10 20,50 30,30 S50,10 70,30 S90,50 110,30 S130,10 150,30 S170,50 190,30 S210,10 230,30',
    //     'M0,30 L10,10 L20,25 L30,5 L40,40 L50,15 L60,35 L70,25 L80,40 L90,20 L100,30 L110,10 L120,35 L130,15 L140,45 L150,25 L160,40 L170,15 L180,35 L190,25 L200,30'
    // ];
    
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
        
        // Observe paragraph sections
        sectionRefs.current.paragraphSections.forEach((section, index) => {
            if (section) {
                section.dataset.sectionId = `section-${index + 1}`;
                observer.observe(section);
            }
        });
        
        // Observe feature boxes
        sectionRefs.current.featureBoxes.forEach((box, index) => {
            if (box) {
                box.dataset.sectionId = `feature-${index}`;
                observer.observe(box);
            }
        });

        // Observe chart visual
        if (sectionRefs.current.chartVisual) {
            sectionRefs.current.chartVisual.dataset.sectionId = 'chart-visual';
            observer.observe(sectionRefs.current.chartVisual);
        }
        
        // Observe additional features section
        if (sectionRefs.current.additionalFeatures) {
            sectionRefs.current.additionalFeatures.dataset.sectionId = 'additional-features';
            observer.observe(sectionRefs.current.additionalFeatures);
        }
        
        // Observe feature cards
        sectionRefs.current.featureCards.forEach((card, index) => {
            if (card) {
                card.dataset.sectionId = `feature-card-${index}`;
                observer.observe(card);
            }
        });

        return () => observer.disconnect();
    }, []);
    

    // Enhanced feature charts with gradients
    const renderFeatureChart = (index) => {
        const paths = [
            "M0,50 C10,30 20,40 30,35 C40,30 50,40 60,35 C70,30 80,45 90,40 C100,35 110,30 120,25",
            "M0,40 C10,45 20,25 30,40 C40,55 50,35 60,40 C70,45 80,20 90,35 C100,50 110,30 120,35",
            "M0,30 C10,40 20,30 30,20 C40,10 50,30 60,25 C70,20 80,35 90,30 C100,25 110,40 120,35"
        ];
        
        return (
            <div className="card-chart">
                <svg width="100%" height="100%" viewBox="0 0 120 60" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={`gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#fff" />
                            <stop offset="100%" stopColor="#ccc" />
                        </linearGradient>
                    </defs>
                    <path d={paths[index % paths.length]} stroke={`url(#gradient-${index})`} />
                </svg>
            </div>
        );
    };

    return (
        <div className="why-container">
            <BinaryBackground />
            
            <div className="content-wrapper">
                {/* Logo */}
                <div className="why-logo">
                    <div className="logo-glow"></div>
                    <div className="logo-container">
                        <h1 className="text-logo">Why The Glitch</h1>
                    </div>
                </div>
                
                {/* Stock Ticker with real-time feel */}
                <div className="ticker-container">
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
                
                <h1 className="why-heading">Why Choose The Glitch</h1>
                <div className="content-grid symmetrical-grid">
                    <div className="why-content symmetrical-left">
                        <div className={`paragraph-section ${visibleSections['section-1'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.paragraphSections[0] = el}
                        >
                            <p className="why-paragraph">
                                The Glitch is your pathway to building generational wealth and breaking free from 
                                destructive financial habits. We teach you how to make your money work for you through 
                                multiple streams of knowledge—from smart investing to creating passive income.
                            </p>
                            <p className="why-paragraph">
                                Stop working just for money and start building wealth that lasts. Our comprehensive 
                                courses and community support help you develop disciplined strategies that generate 
                                lasting prosperity without falling into common financial traps.
                            </p>
                        </div>
                        <div className={`paragraph-section ${visibleSections['section-2'] ? 'fade-in-up' : ''}`}
                            ref={el => sectionRefs.current.paragraphSections[1] = el}
                        >
                            <p className="why-paragraph">
                                Join our community of wealth builders who are creating financial freedom through 
                                smart decision-making. Learn to avoid bad habits, build multiple income streams, 
                                and develop the mindset needed for true generational wealth.
                            </p>
                            <div className="btn-container">
                                <button className="start-btn">
                                    Initialize Trading <FaArrowRight />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="symmetrical-right">
                        <div className="feature-cards-grid">
                            <div className={`feature-box ${visibleSections['feature-0'] ? 'fade-in-up' : ''}`}
                                style={{ transitionDelay: '100ms' }}
                                ref={el => sectionRefs.current.featureBoxes[0] = el}
                            >
                                <div className="feature-icon">
                                    <FaChartLine />
                                </div>
                                <h3 className="feature-title">Wealth Building Knowledge</h3>
                                <p className="feature-description">
                                    Learn proven strategies to build generational wealth and make your money work for you effectively.
                                </p>
                                {renderFeatureChart(0)}
                            </div>
                            <div className={`feature-box ${visibleSections['feature-1'] ? 'fade-in-up' : ''}`}
                                style={{ transitionDelay: '200ms' }}
                                ref={el => sectionRefs.current.featureBoxes[1] = el}
                            >
                                <div className="feature-icon">
                                    <FaGraduationCap />
                                </div>
                                <h3 className="feature-title">Break Bad Habits</h3>
                                <p className="feature-description">
                                    Eliminate destructive financial patterns and develop disciplined money management skills.
                                </p>
                                {renderFeatureChart(1)}
                            </div>
                            <div className={`feature-box ${visibleSections['feature-2'] ? 'fade-in-up' : ''}`}
                                style={{ transitionDelay: '300ms' }}
                                ref={el => sectionRefs.current.featureBoxes[2] = el}
                            >
                                <div className="feature-icon">
                                    <FaUsers />
                                </div>
                                <h3 className="feature-title">Multiple Income Streams</h3>
                                <p className="feature-description">
                                    Discover diverse knowledge paths to create lasting financial security and independence.
                                </p>
                                {renderFeatureChart(2)}
                            </div>
                            {/* Add a fourth card for symmetry, or leave blank for now */}
                        </div>
                    </div>
                </div>
                
                <div 
                    className={`additional-features ${visibleSections['additional-features'] ? 'fade-in-up' : ''}`}
                    ref={el => sectionRefs.current.additionalFeatures = el}
                >
                    <h2 className="section-heading">Exclusive Platform Features</h2>
                    
                    <div className="features-grid">
                        <div 
                            className={`feature-card ${visibleSections['feature-card-0'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '150ms' }}
                            ref={el => sectionRefs.current.featureCards[0] = el}
                        >
                            <div className="feature-card-icon">
                                <RiStockLine />
                            </div>
                            <h3>Financial Freedom Path</h3>
                            <p>
                                Learn to make your money work for you through smart investment strategies and passive income creation. Build wealth that lasts for generations.
                            </p>
                        </div>
                        
                        <div 
                            className={`feature-card ${visibleSections['feature-card-1'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '300ms' }}
                            ref={el => sectionRefs.current.featureCards[1] = el}
                        >
                            <div className="feature-card-icon">
                                <FaLock />
                            </div>
                            <h3>Avoid Financial Traps</h3>
                            <p>
                                Identify and break free from bad financial habits that keep you stuck. Learn disciplined approaches to spending, saving, and investing.
                            </p>
                        </div>
                        
                        <div 
                            className={`feature-card ${visibleSections['feature-card-2'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '450ms' }}
                            ref={el => sectionRefs.current.featureCards[2] = el}
                        >
                            <div className="feature-card-icon">
                                <BiCodeAlt />
                            </div>
                            <h3>Smart Money Strategies</h3>
                            <p>
                                Master the knowledge needed to build multiple income streams through trading, investing, and entrepreneurship on The Glitch platform.
                            </p>
                        </div>
                        
                        <div 
                            className={`feature-card ${visibleSections['feature-card-3'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '600ms' }}
                            ref={el => sectionRefs.current.featureCards[3] = el}
                        >
                            <div className="feature-card-icon">
                                <FaRocket />
                            </div>
                            <h3>Generational Wealth Building</h3>
                            <p>
                                Create lasting prosperity for your family through proven wealth-building strategies that focus on sustainable growth and smart financial decisions.
                            </p>
                        </div>
                        
                        <div 
                            className={`feature-card ${visibleSections['feature-card-4'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '750ms' }}
                            ref={el => sectionRefs.current.featureCards[4] = el}
                        >
                            <div className="feature-card-icon">
                                <FaChartPie />
                            </div>
                            <h3>Diverse Knowledge Streams</h3>
                            <p>
                                Access comprehensive education in trading, investing, business building, and passive income—all the tools needed to achieve true financial freedom.
                            </p>
                        </div>
                        
                        <div 
                            className={`feature-card ${visibleSections['feature-card-5'] ? 'fade-in-up' : ''}`} 
                            style={{ transitionDelay: '900ms' }}
                            ref={el => sectionRefs.current.featureCards[5] = el}
                        >
                            <div className="feature-card-icon">
                                <FaUsers />
                            </div>
                            <h3>The Glitch Community</h3>
                            <p>
                                Join like-minded individuals committed to breaking free from financial limitations and building generational wealth through smart, disciplined strategies.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhyInfinity;