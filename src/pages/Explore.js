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
    { icon: <FaDollarSign />, title: 'Generational Wealth Education', description: 'Learn proven strategies to build lasting wealth that spans generations' },
    { icon: <FaRocket />, title: 'Multiple Income Streams', description: 'Discover diverse knowledge paths including trading, investing, and passive income' },
    { icon: <FaChartLine />, title: 'Break Bad Habits', description: 'Identify and eliminate destructive financial patterns' },
    { icon: <FaGraduationCap />, title: 'Money Works For You', description: 'Master passive income and investment strategies' },
    { icon: <FaTrophy />, title: 'Comprehensive Knowledge', description: 'Access courses on trading, investing, and wealth building' },
    { icon: <FaUsers />, title: 'AURA FX Advantage', description: 'Join a community committed to breaking financial limitations' }
  ];

  // What We Offer
  const offerings = [
    { icon: <FaGraduationCap />, title: 'Expert-Led Courses', description: 'Comprehensive courses taught by experienced professionals' },
    { icon: <FaUsers />, title: 'Live Community', description: 'Connect with fellow learners and share strategies' },
    { icon: <FaBook />, title: 'Practical Strategies', description: 'Real-world strategies you can implement immediately' },
    { icon: <FaHandshake />, title: 'Ongoing Support', description: 'Continuous learning resources and updates' }
  ];

  // Benefits
  const benefits = [
    'Build generational wealth through proven strategies',
    'Create multiple income streams for financial security',
    'Learn from expert mentors with real-world experience',
    'Join an active community of wealth builders',
    'Access comprehensive courses on all aspects of trading',
    'Break free from bad financial habits',
    'Make money work for you, not the other way around',
    'Achieve true financial freedom'
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
              AURA FX is a leading financial education platform dedicated to helping individuals build generational wealth through multiple income streams. We provide comprehensive courses, expert guidance, and a supportive community focused on breaking free from traditional financial limitations.
            </p>
            <p className="about-text">
              Our mission is to empower you with the knowledge and strategies needed to create sustainable wealth that spans generations. We teach you how to make money work for you, not the other way around.
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
          <h2 className="cta-title">Ready to Start Your Wealth Journey?</h2>
          <p className="cta-description">Join thousands of learners building generational wealth today</p>
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
