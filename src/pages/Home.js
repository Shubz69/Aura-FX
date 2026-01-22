import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import Chatbot from "../components/Chatbot";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import { FaChartLine, FaUsers, FaTrophy, FaGraduationCap, FaRocket, FaShieldAlt, FaClock, FaGlobe, FaCoins, FaChartBar } from 'react-icons/fa';

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    // Initial static market data (fallback)
    const initialMarketData = [
        { symbol: 'AAPL', price: '192.53', change: '+2.38', isUp: true },
        { symbol: 'MSFT', price: '426.74', change: '-1.28', isUp: false },
        { symbol: 'GOOGL', price: '183.42', change: '+3.71', isUp: true },
        { symbol: 'AMZN', price: '186.93', change: '+1.26', isUp: true },
        { symbol: 'TSLA', price: '244.18', change: '-5.32', isUp: false },
        { symbol: 'META', price: '484.32', change: '+2.95', isUp: true },
        { symbol: 'NVDA', price: '947.52', change: '+18.67', isUp: true },
        { symbol: 'EURUSD', price: '1.0850', change: '+0.15', isUp: true },
        { symbol: 'GBPUSD', price: '1.2650', change: '-0.23', isUp: false },
        { symbol: 'USDJPY', price: '150.25', change: '+0.45', isUp: true },
        { symbol: 'AUDUSD', price: '0.6520', change: '+0.12', isUp: true },
        { symbol: 'XAUUSD', price: '2724.50', change: '+15.30', isUp: true },
        { symbol: 'XAGUSD', price: '31.25', change: '+0.45', isUp: true },
        { symbol: 'OIL', price: '78.50', change: '-1.20', isUp: false }
    ];
    
    const [marketData, setMarketData] = useState(initialMarketData);

    // Fetch live market data for ticker - 24/7 updates using TradingView-compatible sources
    useEffect(() => {
        if (!showContent) return;

        const symbols = [
            // Stocks
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA',
            // Forex
            'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD',
            // Commodities
            'XAUUSD', 'XAGUSD', 'CL=F' // Gold, Silver, Oil
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
                    const price = marketData?.price;
                    
                    if (responseData.success && price && typeof price === 'number' && price > 0 && !isNaN(price)) {
                        const previousPrice = parseFloat(localStorage.getItem(`prev_${symbol}`)) || price;
                        const change = price - previousPrice;
                        const changePercent = previousPrice > 0 ? ((change / previousPrice) * 100).toFixed(2) : '0.00';
                        
                        localStorage.setItem(`prev_${symbol}`, price.toString());
                        
                        // Format price based on instrument type
                        let formattedPrice = price.toFixed(2);
                        if (symbol.includes('XAU') || symbol.includes('GOLD')) {
                            formattedPrice = price.toFixed(2);
                        } else if (symbol.includes('XAG') || symbol.includes('SILVER')) {
                            formattedPrice = price.toFixed(2);
                        } else if (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('AUD')) {
                            formattedPrice = price.toFixed(4);
                        } else if (symbol.includes('JPY')) {
                            formattedPrice = price.toFixed(2);
                        } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
                            formattedPrice = price.toFixed(2);
                        }
                        
                        return {
                            symbol: symbol.length > 6 ? symbol.substring(0, 6) : symbol,
                            price: formattedPrice,
                            change: changePercent >= 0 ? `+${changePercent}` : changePercent.toString(),
                            isUp: change >= 0
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
            // Only fetch if page is visible (or always for 24/7)
            const results = await Promise.all(symbols.map(fetchData));
            const validData = results.filter(item => item !== null);
            
            if (validData.length > 0) {
                setMarketData(validData);
            }
        };

        // Initial fetch
        fetchAllData();

        // Update every 10 seconds for true live data (24/7)
        const interval = setInterval(fetchAllData, 10000);

        // Handle page visibility - continue updating even when tab is in background
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                // Page is visible, ensure updates continue
                fetchAllData();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [showContent]);

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
                        <div className="home-logo-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                            <A7Logo />
                            {/* Brand Name - Styled exactly as shown */}
                            <div className="brand-name-container">
                                <h1 className="brand-name">AURA FX</h1>
                                <p className="powered-by-glitch">powered by <strong>THE GLITCH</strong></p>
                            </div>
                        </div>

                        {/* Main Content Section */}
                        <div className="home-main-content">
                            <div className="content-intro">
                                <p className="intro-text">
                                    Transform Your Trading Career with Elite Education and Proven Strategies
                                </p>
                            </div>

                            {/* Stock Ticker Banner */}
                            <div className="stock-ticker-compact">
                                <div className="ticker">
                                    {marketData.concat(marketData).map((item, index) => (
                                        <div key={`${item.symbol}-${index}`} className="ticker-item">
                                            <span className="ticker-symbol">{item.symbol}</span>
                                            <span className="ticker-price">{item.price}</span>
                                            <span className={`ticker-change ${item.isUp ? 'ticker-up' : 'ticker-down'}`}>
                                                {item.isUp ? "▲" : "▼"} {item.change}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

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
                                        <h3 className="market-title">Futures</h3>
                                        <p className="market-description">Master futures contracts and commodity trading with professional strategies</p>
                                    </div>
                                    <div className="market-item">
                                        <div className="market-icon"><FaCoins /></div>
                                        <h3 className="market-title">Commodities</h3>
                                        <p className="market-description">Trade gold, oil, and other valuable resources</p>
                                    </div>
                                    <div className="market-item">
                                        <div className="market-icon"><FaChartBar /></div>
                                        <h3 className="market-title">Indices</h3>
                                        <p className="market-description">Major global indices including S&P 500, NASDAQ, and more</p>
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
