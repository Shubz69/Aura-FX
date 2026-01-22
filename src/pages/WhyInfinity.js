import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/WhyInfinity.css";
import CosmicBackground from "../components/CosmicBackground";
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

    // Live stock data for ticker - 24/7 updates using TradingView-compatible sources
    const [stockData, setStockData] = useState([
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
    ]);

    // Fetch live market data for ticker - 24/7 updates
    useEffect(() => {
        const symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA',
            'JPM', 'V', 'NFLX', 'AMD', 'COIN', 'ETH', 'BTC'
        ];

        const fetchData = async (symbol) => {
            try {
                const API_BASE_URL = window.location.origin;
                const response = await fetch(`${API_BASE_URL}/api/ai/market-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ symbol, type: 'quote' })
                });

                if (response.ok) {
                    const responseData = await response.json();
                    // API returns { success: true, data: { price: ... } }
                    const marketData = responseData.data || responseData;
                    
                    // Extract price - handle multiple possible formats
                    let price = null;
                    if (marketData?.price !== undefined) {
                        price = typeof marketData.price === 'string' ? parseFloat(marketData.price) : marketData.price;
                    } else if (marketData?.regularMarketPrice !== undefined) {
                        price = typeof marketData.regularMarketPrice === 'string' ? parseFloat(marketData.regularMarketPrice) : marketData.regularMarketPrice;
                    } else if (marketData?.c !== undefined) {
                        price = typeof marketData.c === 'string' ? parseFloat(marketData.c) : marketData.c;
                    }
                    
                    // Extract daily percentage change - prioritize API's changePercent (daily change from previousClose)
                    let changePercent = null;
                    let isUp = true;
                    
                    // First, try to use API's changePercent (most accurate - daily change)
                    if (marketData?.changePercent !== undefined) {
                        // Remove % sign if present and parse
                        const percentStr = marketData.changePercent.toString().replace('%', '');
                        changePercent = parseFloat(percentStr);
                        if (!isNaN(changePercent)) {
                            isUp = changePercent >= 0;
                        }
                    }
                    
                    // If no changePercent, calculate from previousClose (daily change)
                    if (changePercent === null && marketData?.previousClose !== undefined && price !== null) {
                        const previousClose = typeof marketData.previousClose === 'string' 
                            ? parseFloat(marketData.previousClose) 
                            : marketData.previousClose;
                        if (previousClose > 0 && !isNaN(previousClose)) {
                            changePercent = ((price - previousClose) / previousClose) * 100;
                            isUp = changePercent >= 0;
                        }
                    }
                    
                    // If still no changePercent, try change field
                    if (changePercent === null && marketData?.change !== undefined && marketData?.previousClose !== undefined) {
                        const change = typeof marketData.change === 'string' 
                            ? parseFloat(marketData.change) 
                            : marketData.change;
                        const previousClose = typeof marketData.previousClose === 'string' 
                            ? parseFloat(marketData.previousClose) 
                            : marketData.previousClose;
                        if (previousClose > 0 && !isNaN(change) && !isNaN(previousClose)) {
                            changePercent = (change / previousClose) * 100;
                            isUp = change >= 0;
                        }
                    }
                    
                    // Last resort: use localStorage comparison (but this is less accurate)
                    if (changePercent === null && price !== null) {
                        const previousPrice = parseFloat(localStorage.getItem(`prev_${symbol}`)) || price;
                        const change = price - previousPrice;
                        if (previousPrice > 0) {
                            changePercent = (change / previousPrice) * 100;
                            isUp = change >= 0;
                        } else {
                            changePercent = 0;
                        }
                        localStorage.setItem(`prev_${symbol}`, price.toString());
                    }
                    
                    // Validate price - allow 0 for some edge cases, but must be a valid number
                    if (responseData.success && price !== null && !isNaN(price) && typeof price === 'number' && isFinite(price) && price >= 0) {
                        // Format price based on instrument type
                        let formattedPrice = price.toFixed(2);
                        if (symbol === 'BTC' || symbol === 'ETH') {
                            formattedPrice = price.toFixed(2);
                        } else if (price > 1000) {
                            formattedPrice = price.toFixed(2);
                        } else if (price > 100) {
                            formattedPrice = price.toFixed(2);
                        } else {
                            formattedPrice = price.toFixed(2);
                        }
                        
                        // Format changePercent - ensure it shows actual daily percentage, not 0% if there's a change
                        let formattedChange = '0.00';
                        if (changePercent !== null && !isNaN(changePercent) && isFinite(changePercent)) {
                            // Round to 2 decimal places and format
                            formattedChange = Math.abs(changePercent) < 0.01 ? '0.00' : changePercent.toFixed(2);
                            formattedChange = changePercent >= 0 ? `+${formattedChange}` : formattedChange;
                        }
                        
                        return {
                            symbol: symbol,
                            price: formattedPrice,
                            change: formattedChange,
                            isUp: isUp
                        };
                    } else {
                        console.warn(`No valid price data for ${symbol}:`, responseData);
                    }
                } else {
                    console.warn(`API error for ${symbol}:`, response.status, response.statusText);
                }
            } catch (error) {
                console.error(`Error fetching ${symbol}:`, error);
            }
            return null;
        };

        const fetchAllData = async () => {
            const results = await Promise.all(symbols.map(fetchData));
            const validData = results.filter(item => item !== null);
            
            if (validData.length > 0) {
                setStockData(validData);
            }
        };

        // Initial fetch
        fetchAllData();

        // Update every 10 seconds for true live data (24/7)
        const interval = setInterval(fetchAllData, 10000);

        // Handle page visibility - continue updating even when tab is in background
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                fetchAllData();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
    
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
