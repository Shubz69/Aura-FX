import React from 'react';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';
import { 
  FaChartLine, 
  FaTrophy, 
  FaRocket, 
  FaGlobe,
  FaCoins,
  FaChartBar
} from 'react-icons/fa';

const Explore = () => {
  return (
    <div className="explore-page">
      <CosmicBackground />
      
      {/* Main Title */}
      <div className="explore-header">
        <h1 className="explore-title">EXPLORE</h1>
      </div>

      {/* Content */}
      <div className="explore-content">
        {/* Trade Multiple Markets Section */}
        <section className="trading-markets-section">
          <h2 className="section-title">TRADE MULTIPLE MARKETS</h2>
          <div className="markets-grid">
            <div className="market-item">
              <div className="market-icon"><FaChartLine /></div>
              <h3 className="market-title">FOREX</h3>
              <p className="market-description">Major, minor, and exotic currency pairs</p>
            </div>
            <div className="market-item">
              <div className="market-icon"><FaTrophy /></div>
              <h3 className="market-title">STOCKS</h3>
              <p className="market-description">US and international equity markets</p>
            </div>
            <div className="market-item">
              <div className="market-icon"><FaRocket /></div>
              <h3 className="market-title">CRYPTO</h3>
              <p className="market-description">Bitcoin, Ethereum, and altcoins</p>
            </div>
            <div className="market-item">
              <div className="market-icon"><FaGlobe /></div>
              <h3 className="market-title">FUTURES</h3>
              <p className="market-description">Master futures contracts and commodity trading with professional strategies</p>
            </div>
            <div className="market-item">
              <div className="market-icon"><FaCoins /></div>
              <h3 className="market-title">COMMODITIES</h3>
              <p className="market-description">Trade gold, oil, and other valuable resources</p>
            </div>
            <div className="market-item">
              <div className="market-icon"><FaChartBar /></div>
              <h3 className="market-title">INDICES</h3>
              <p className="market-description">Major global indices including S&P 500, NASDAQ, and more</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Explore;
