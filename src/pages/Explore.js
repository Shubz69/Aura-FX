import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';
import { 
  FaChartLine, 
  FaTrophy, 
  FaRocket, 
  FaGlobe,
  FaCoins,
  FaChartBar,
  FaUsers,
  FaGraduationCap,
  FaComments,
  FaArrowRight,
  FaHome,
  FaBook,
  FaQuestionCircle,
  FaEnvelope
} from 'react-icons/fa';

const Explore = () => {
  const navigate = useNavigate();

  const sitePages = [
    {
      icon: <FaHome />,
      title: 'Home',
      description: 'Discover AURA FX and learn about our professional trading education platform. Get started with elite mentorship and proven strategies.',
      path: '/'
    },
    {
      icon: <FaBook />,
      title: 'Courses & Subscriptions',
      description: 'Browse our comprehensive trading courses and subscription plans. Choose the perfect plan for your trading journey.',
      path: '/courses'
    },
    {
      icon: <FaComments />,
      title: 'Community',
      description: 'Join 1,200+ active traders in our thriving community. Share strategies, discuss markets, and learn from experienced professionals.',
      path: '/community'
    },
    {
      icon: <FaQuestionCircle />,
      title: 'Why AURA FX',
      description: 'Learn why AURA FX is the premier choice for professional trading education. Discover our approach to consistent profitability.',
      path: '/why-aura-fx'
    },
    {
      icon: <FaEnvelope />,
      title: 'Contact Us',
      description: 'Get in touch with our support team. We\'re here to help with any questions about our platform, courses, or subscriptions.',
      path: '/contact'
    }
  ];

  const platformFeatures = [
    {
      icon: <FaGraduationCap />,
      title: 'Expert-Led Courses',
      description: 'Access comprehensive trading courses taught by industry professionals with verified track records. Learn institutional-grade strategies.'
    },
    {
      icon: <FaUsers />,
      title: 'Active Community',
      description: 'Connect with 1,200+ traders sharing exclusive insights, real-time market analysis, and proven trading strategies.'
    },
    {
      icon: <FaChartLine />,
      title: 'Multiple Markets',
      description: 'Master trading across Forex, Stocks, Crypto, Futures, Commodities, and Indices. Diversify your trading knowledge.'
    },
    {
      icon: <FaRocket />,
      title: 'Premium AI Assistant',
      description: 'Access Aura AI for professional trading analysis, market insights, and personalized trading strategies tailored to your needs.'
    }
  ];

  return (
    <div className="explore-container">
      <CosmicBackground />
      
      <div className="explore-content-wrapper">
        {/* Header Section */}
        <header className="explore-header">
          <h1 className="explore-main-title">EXPLORE</h1>
        </header>

        {/* Main Content - Split Layout */}
        <div className="explore-main-content">
          <div className="explore-text-section">
            <h2 className="explore-subtitle">Discover AURA FX</h2>
            <div className="explore-divider"></div>
            <p className="explore-text">
              Welcome to AURA FX—your gateway to professional trading education. This page will help you navigate our platform and discover everything we offer. Whether you're new to trading or looking to enhance your skills, explore our comprehensive resources designed to transform you into a consistently profitable trader.
            </p>
            <p className="explore-text">
              Our platform offers multiple ways to learn and grow. From structured courses and expert mentorship to an active trading community and advanced AI assistance, we provide the tools and knowledge you need to succeed across all major markets.
            </p>
            <p className="explore-text">
              Take your time exploring each section. Each page is designed to provide specific value—whether you're researching our courses, connecting with the community, or learning about our approach to trading education. Start your journey toward consistent profitability today.
            </p>
            <button className="explore-cta-button" onClick={() => navigate('/register')}>
              Get Started <FaArrowRight />
            </button>
          </div>

          <div className="explore-features-section">
            {platformFeatures.map((feature, index) => (
              <div key={index} className="explore-feature-card">
                <div className="explore-feature-icon">
                  {feature.icon}
                </div>
                <h3 className="explore-feature-title">{feature.title}</h3>
                <p className="explore-feature-text">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Site Pages Section */}
        <div className="explore-pages-section">
          <h2 className="explore-section-heading">Navigate Our Platform</h2>
          <p className="explore-section-description">
            Explore the different sections of AURA FX to find exactly what you need for your trading journey.
          </p>
          
          <div className="explore-pages-grid">
            {sitePages.map((page, index) => (
              <div 
                key={index} 
                className="explore-page-card"
                onClick={() => navigate(page.path)}
              >
                <div className="explore-page-icon">
                  {page.icon}
                </div>
                <h3 className="explore-page-title">{page.title}</h3>
                <p className="explore-page-description">{page.description}</p>
                <div className="explore-page-link">
                  Visit Page <FaArrowRight />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trading Markets Section */}
        <div className="explore-markets-section">
          <h2 className="explore-section-heading">TRADE MULTIPLE MARKETS</h2>
          <div className="explore-markets-grid">
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaChartLine /></div>
              <h3 className="explore-market-title">FOREX</h3>
              <p className="explore-market-description">Major, minor, and exotic currency pairs</p>
            </div>
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaTrophy /></div>
              <h3 className="explore-market-title">STOCKS</h3>
              <p className="explore-market-description">US and international equity markets</p>
            </div>
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaRocket /></div>
              <h3 className="explore-market-title">CRYPTO</h3>
              <p className="explore-market-description">Bitcoin, Ethereum, and altcoins</p>
            </div>
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaGlobe /></div>
              <h3 className="explore-market-title">FUTURES</h3>
              <p className="explore-market-description">Master futures contracts and commodity trading with professional strategies</p>
            </div>
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaCoins /></div>
              <h3 className="explore-market-title">COMMODITIES</h3>
              <p className="explore-market-description">Trade gold, oil, and other valuable resources</p>
            </div>
            <div className="explore-market-item">
              <div className="explore-market-icon"><FaChartBar /></div>
              <h3 className="explore-market-title">INDICES</h3>
              <p className="explore-market-description">Major global indices including S&P 500, NASDAQ, and more</p>
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className="explore-footer">
          <div className="explore-footer-content">
            <span className="explore-footer-text">Courses Provided</span>
            <span className="explore-footer-separator">•</span>
            <span className="explore-footer-powered">
              powered by <strong>THE GLITCH</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explore;
