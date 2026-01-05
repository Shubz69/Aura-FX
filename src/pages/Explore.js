import React from 'react';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';
import { 
  FaChartLine, 
  FaUsers, 
  FaTrophy, 
  FaGraduationCap, 
  FaRocket, 
  FaDollarSign,
  FaBitcoin,
  FaCoins,
  FaBuilding,
  FaLaptop,
  FaBrain,
  FaRobot,
  FaHome,
  FaShieldAlt,
  FaHandshake,
  FaBook,
  FaNetworkWired
} from 'react-icons/fa';

const Explore = () => {
  // Stock ticker data
  const stockData = [
    { symbol: 'BTC', price: '41,225.78', change: '+3.6%', positive: true },
    { symbol: 'ETH', price: '2,482.15', change: '+5.2%', positive: true },
    { symbol: 'AAPL', price: '188.95', change: '-1.2%', positive: false },
    { symbol: 'MSFT', price: '399.25', change: '+2.1%', positive: true },
    { symbol: 'TSLA', price: '242.55', change: '+4.8%', positive: true },
    { symbol: 'NVDA', price: '624.78', change: '+2.7%', positive: true },
    { symbol: 'AMZN', price: '182.95', change: '-0.7%', positive: false },
    { symbol: 'GOOG', price: '165.30', change: '+1.3%', positive: true },
    { symbol: 'SPY', price: '490.15', change: '-0.4%', positive: false },
    { symbol: 'QQQ', price: '420.85', change: '+0.8%', positive: true }
  ];

  // Trading Markets
  const tradingMarkets = [
    { icon: <FaBitcoin />, title: 'Cryptocurrency Trading', description: 'Master Bitcoin, Ethereum, and altcoin trading strategies' },
    { icon: <FaChartLine />, title: 'Forex Trading', description: 'Learn currency pair trading and market analysis' },
    { icon: <FaBuilding />, title: 'Stock Market', description: 'Navigate equities, ETFs, and index trading' },
    { icon: <FaCoins />, title: 'Commodities', description: 'Trade gold, oil, and other valuable resources' },
    { icon: <FaRocket />, title: 'Futures & Options', description: 'Advanced derivatives trading strategies' },
    { icon: <FaNetworkWired />, title: 'Forex Pairs', description: 'Major, minor, and exotic currency pairs' }
  ];

  // Course Categories
  const courseCategories = [
    { icon: <FaLaptop />, title: 'E-Commerce', description: 'Build and scale online businesses' },
    { icon: <FaTrophy />, title: 'Health & Fitness', description: 'Monetize your wellness expertise' },
    { icon: <FaChartLine />, title: 'Trading', description: 'Professional trading strategies and techniques' },
    { icon: <FaHome />, title: 'Real Estate', description: 'Property investment and management' },
    { icon: <FaUsers />, title: 'Social Media', description: 'Build brands and monetize platforms' },
    { icon: <FaBrain />, title: 'Psychology and Mindset', description: 'Develop winning mental frameworks' },
    { icon: <FaRobot />, title: 'Algorithmic AI', description: 'AI-powered trading and automation' },
    { icon: <FaBitcoin />, title: 'Crypto', description: 'Blockchain and cryptocurrency mastery' }
  ];

  // Core Values
  const coreValues = [
    { icon: <FaShieldAlt />, title: 'Trust & Integrity', description: 'Ethical practices and transparent education' },
    { icon: <FaGraduationCap />, title: 'Comprehensive Education', description: 'In-depth courses covering all aspects of wealth building' },
    { icon: <FaHandshake />, title: 'Community Support', description: 'Join a network of like-minded wealth builders' },
    { icon: <FaBook />, title: 'Practical Knowledge', description: 'Real-world strategies you can implement immediately' }
  ];

  // Success Metrics (without names)
  const successMetrics = [
    { number: '10,000+', label: 'Active Learners' },
    { number: '8', label: 'Core Course Categories' },
    { number: '24/7', label: 'Community Access' },
    { number: '100%', label: 'Practical Focus' }
  ];

  return (
    <div className="explore-page">
      <CosmicBackground />
      
      {/* Hero Section with Stock Ticker */}
      <section className="explore-hero">
        <div className="stock-ticker">
          <div className="ticker-wrap">
            <div className="ticker">
              {stockData.map((stock, index) => (
                <div key={index} className="ticker-item">
                  <span className="stock-symbol">{stock.symbol}</span>
                  <span className="stock-price">{stock.price}</span>
                  <span className={`stock-change ${stock.positive ? 'positive' : 'negative'}`}>
                    {stock.change}
                  </span>
                </div>
              ))}
              {stockData.map((stock, index) => (
                <div key={`dup-${index}`} className="ticker-item">
                  <span className="stock-symbol">{stock.symbol}</span>
                  <span className="stock-price">{stock.price}</span>
                  <span className={`stock-change ${stock.positive ? 'positive' : 'negative'}`}>
                    {stock.change}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-content">
          <h1 className="hero-title">WELCOME TO AURA FX</h1>
          <p className="hero-description">
            Build <strong>GENERATIONAL WEALTH</strong> through our comprehensive educational platform. Learn to make money work for you, eliminate bad financial habits, and achieve true financial freedom through disciplined education and smart investment strategies.
          </p>
        </div>
      </section>

      {/* About AURA FX */}
      <section className="about-section">
        <h2 className="section-title">ABOUT AURA FX</h2>
        <div className="about-content">
          <div className="about-text">
            <p>
              AURA FX is a leading financial education platform dedicated to helping individuals build generational wealth through multiple income streams. We provide comprehensive courses, expert guidance, and a supportive community focused on breaking free from traditional financial limitations.
            </p>
            <p>
              Our mission is to empower you with the knowledge and strategies needed to create sustainable wealth that spans generations. We teach you how to make money work for you, not the other way around.
            </p>
          </div>
        </div>
      </section>

      {/* Success Metrics */}
      <section className="metrics-section">
        <div className="metrics-grid">
          {successMetrics.map((metric, index) => (
            <div key={index} className="metric-card">
              <div className="metric-number">{metric.number}</div>
              <div className="metric-label">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Features */}
      <section className="features-showcase">
        <h2 className="section-title">PLATFORM FEATURES</h2>
        <div className="features-showcase-grid">
          <div className="showcase-card">
            <div className="showcase-icon"><FaDollarSign /></div>
            <h3>Generational Wealth Education</h3>
            <p>Learn proven strategies to build lasting wealth that spans generations. Break free from the cycle of living paycheck to paycheck.</p>
          </div>
          <div className="showcase-card">
            <div className="showcase-icon"><FaRocket /></div>
            <h3>Multiple Income Streams</h3>
            <p>Discover diverse knowledge paths including trading, investing, business, and passive income to create financial security.</p>
          </div>
          <div className="showcase-card">
            <div className="showcase-icon"><FaChartLine /></div>
            <h3>Break Bad Habits</h3>
            <p>Identify and eliminate destructive financial patterns. Learn disciplined money management and smart spending principles.</p>
          </div>
          <div className="showcase-card">
            <div className="showcase-icon"><FaGraduationCap /></div>
            <h3>Money Works For You</h3>
            <p>Master the art of passive income and investment strategies that generate wealth while you focus on what matters most.</p>
          </div>
          <div className="showcase-card">
            <div className="showcase-icon"><FaTrophy /></div>
            <h3>Comprehensive Knowledge Base</h3>
            <p>Access courses on trading, investing, entrepreneurship, and wealth building—all designed to help you achieve financial freedom.</p>
          </div>
          <div className="showcase-card">
            <div className="showcase-icon"><FaUsers /></div>
            <h3>AURA FX Advantage</h3>
            <p>Join a community committed to breaking traditional financial limitations and creating extraordinary wealth through smart, ethical strategies.</p>
          </div>
        </div>
      </section>

      {/* Trading Markets */}
      <section className="markets-section">
        <h2 className="section-title">TRADING MARKETS</h2>
        <div className="markets-grid">
          {tradingMarkets.map((market, index) => (
            <div key={index} className="market-card">
              <div className="market-icon">{market.icon}</div>
              <h3>{market.title}</h3>
              <p>{market.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Course Categories */}
      <section className="courses-section">
        <h2 className="section-title">COURSE CATEGORIES</h2>
        <div className="courses-grid">
          {courseCategories.map((course, index) => (
            <div key={index} className="course-card">
              <div className="course-icon">{course.icon}</div>
              <h3>{course.title}</h3>
              <p>{course.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Core Values */}
      <section className="values-section">
        <h2 className="section-title">OUR CORE VALUES</h2>
        <div className="values-grid">
          {coreValues.map((value, index) => (
            <div key={index} className="value-card">
              <div className="value-icon">{value.icon}</div>
              <h3>{value.title}</h3>
              <p>{value.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What We Offer */}
      <section className="offerings-section">
        <h2 className="section-title">WHAT WE OFFER</h2>
        <div className="offerings-content">
          <div className="offering-item">
            <h3>Expert-Led Courses</h3>
            <p>Comprehensive courses taught by experienced professionals covering all aspects of wealth building, trading, and financial independence.</p>
          </div>
          <div className="offering-item">
            <h3>Live Community</h3>
            <p>Connect with fellow learners, share strategies, ask questions, and grow together in our active community platform.</p>
          </div>
          <div className="offering-item">
            <h3>Practical Strategies</h3>
            <p>Real-world, actionable strategies you can implement immediately to start building wealth and creating multiple income streams.</p>
          </div>
          <div className="offering-item">
            <h3>Ongoing Support</h3>
            <p>Continuous learning resources, updates, and support to help you stay ahead in your wealth-building journey.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Explore;
