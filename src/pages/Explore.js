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
  FaHandshake,
  FaBook,
  FaNetworkWired,
  FaArrowRight,
  FaCheckCircle
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

const Explore = () => {
  const navigate = useNavigate();

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

  // Platform Features
  const platformFeatures = [
    { icon: <FaDollarSign />, title: 'Generational Wealth Education', description: 'Master proven, institutional-grade strategies to build lasting wealth that spans multiple generations' },
    { icon: <FaRocket />, title: 'Multiple Income Streams', description: 'Discover diverse, scalable knowledge paths including professional trading, strategic investing, and passive income generation' },
    { icon: <FaChartLine />, title: 'Break Bad Habits', description: 'Identify and eliminate destructive financial patterns with expert guidance and proven methodologies' },
    { icon: <FaGraduationCap />, title: 'Money Works For You', description: 'Master advanced passive income and investment strategies that generate consistent returns' },
    { icon: <FaTrophy />, title: 'Comprehensive Knowledge', description: 'Access premium courses on professional trading, strategic investing, and generational wealth building' },
    { icon: <FaUsers />, title: 'AURA FX Advantage', description: 'Join an elite community of 1,200+ successful traders committed to achieving financial freedom' }
  ];

  // What We Offer
  const offerings = [
    { icon: <FaGraduationCap />, title: 'Elite Expert-Led Courses', description: 'Comprehensive, premium courses taught by industry-leading professionals with verified track records' },
    { icon: <FaUsers />, title: 'Thriving Live Community', description: 'Connect with 1,200+ active traders, share exclusive strategies, and network with successful professionals' },
    { icon: <FaBook />, title: 'Battle-Tested Strategies', description: 'Real-world, proven strategies you can implement immediately to generate consistent results' },
    { icon: <FaHandshake />, title: '24/7 Premium Support', description: 'Continuous learning resources, real-time updates, and dedicated expert assistance whenever you need it' }
  ];

  // Benefits
  const benefits = [
    'Build generational wealth through institutional-grade, proven strategies',
    'Create multiple diversified income streams for lasting financial security',
    'Learn from elite mentors with decades of real-world trading experience',
    'Join a thriving community of 1,200+ active wealth builders and successful traders',
    'Access comprehensive premium courses covering all aspects of professional trading',
    'Break free from destructive financial habits with expert guidance',
    'Transform your relationship with money - make it work for you, not against you',
    'Achieve true financial freedom and independence through disciplined education'
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
            Build <strong>GENERATIONAL WEALTH</strong> through our elite educational platform. Master proven strategies to make money work for you, eliminate destructive financial patterns, and achieve true financial independence through expert-led education and institutional-grade investment methodologies.
          </p>
          <div className="hero-cta">
            <button className="cta-primary" onClick={() => navigate('/register')}>
              Get Started <FaArrowRight />
            </button>
            <button className="cta-secondary" onClick={() => navigate('/courses')}>
              View Courses
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="about-section">
        <div className="about-container">
          <h2 className="section-title">ABOUT AURA FX</h2>
          <div className="about-content">
            <p className="about-text">
              AURA FX is the premier financial education platform dedicated to empowering individuals to build generational wealth through diversified income streams. We deliver comprehensive courses, elite mentorship, and a thriving community of 1,200+ successful traders committed to breaking free from traditional financial constraints.
            </p>
            <p className="about-text">
              Our mission is to equip you with the institutional-grade knowledge and battle-tested strategies needed to create sustainable, multi-generational wealth. We teach you how to make money work for you, transforming you from a consumer into a wealth creator.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="features-section">
        <div className="features-container">
          <h2 className="section-title">PLATFORM FEATURES</h2>
          <div className="features-grid">
            {platformFeatures.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon-wrapper">
                  <div className="feature-icon">{feature.icon}</div>
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trading Markets */}
      <section className="markets-section">
        <div className="markets-container">
          <h2 className="section-title">TRADING MARKETS</h2>
          <p className="section-subtitle">Master multiple trading markets and diversify your portfolio</p>
          <div className="markets-grid">
            {tradingMarkets.map((market, index) => (
              <div key={index} className="market-card">
                <div className="market-icon">{market.icon}</div>
                <h3 className="market-title">{market.title}</h3>
                <p className="market-description">{market.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Course Categories */}
      <section className="courses-section">
        <div className="courses-container">
          <h2 className="section-title">COURSE CATEGORIES</h2>
          <p className="section-subtitle">Explore our comprehensive range of educational courses</p>
          <div className="courses-grid">
            {courseCategories.map((course, index) => (
              <div key={index} className="course-card" onClick={() => navigate('/courses')}>
                <div className="course-icon">{course.icon}</div>
                <h3 className="course-title">{course.title}</h3>
                <p className="course-description">{course.description}</p>
                <div className="course-link">
                  Learn More <FaArrowRight />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Offer */}
      <section className="offerings-section">
        <div className="offerings-container">
          <h2 className="section-title">WHAT WE OFFER</h2>
          <div className="offerings-grid">
            {offerings.map((offering, index) => (
              <div key={index} className="offering-card">
                <div className="offering-icon">{offering.icon}</div>
                <h3 className="offering-title">{offering.title}</h3>
                <p className="offering-description">{offering.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="benefits-section">
        <div className="benefits-container">
          <h2 className="section-title">WHY CHOOSE AURA FX</h2>
          <div className="benefits-grid">
            {benefits.map((benefit, index) => (
              <div key={index} className="benefit-item">
                <FaCheckCircle className="benefit-icon" />
                <span className="benefit-text">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="explore-cta-section">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Transform Your Financial Future?</h2>
          <p className="cta-description">Join 1,200+ elite traders building generational wealth and achieving financial freedom today</p>
          <div className="cta-buttons">
            <button className="cta-primary" onClick={() => navigate('/register')}>
              Sign Up Now <FaArrowRight />
            </button>
            <button className="cta-secondary" onClick={() => navigate('/courses')}>
              Browse Courses
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Explore;
