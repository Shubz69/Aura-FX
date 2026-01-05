import React from 'react';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';
import { FaChartLine, FaUsers, FaTrophy, FaGraduationCap, FaRocket, FaDollarSign } from 'react-icons/fa';

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

  // Team members data
  const teamMembers = [
    {
      id: 1,
      name: 'Shubz',
      role: 'Lead Architect',
      expertise: 'Wealth Building',
      description: 'Expert in creating sustainable income streams and teaching principles of generational wealth creation.'
    },
    {
      id: 2,
      name: 'Aaron',
      role: 'UI/UX Director',
      expertise: 'Financial Education',
      description: 'Designs learning experiences that help you understand how to make your money work for you.'
    },
    {
      id: 3,
      name: 'Shaun',
      role: 'Investment Strategist',
      expertise: 'Smart Investing',
      description: 'Teaches disciplined wealth-building strategies and how to avoid common financial pitfalls.'
    },
    {
      id: 4,
      name: 'Leonardo',
      role: 'Financial Mentor',
      expertise: 'Multiple Income Streams',
      description: 'Guides you through building diverse income sources and achieving lasting financial independence.'
    }
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
            Build <strong>GENERATIONAL WEALTH</strong> through our multiple streams of knowledge. Learn to make money work for you, avoid bad financial habits, and gain true financial freedom through disciplined education and smart investment strategies.
          </p>
        </div>
      </section>

      {/* Platform Features - New Card Layout */}
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

      {/* Team Section - New Vertical Timeline Layout */}
      <section className="team-showcase">
        <h2 className="section-title">OUR EXPERT TEAM</h2>
        <div className="team-timeline">
          {teamMembers.map((member, index) => (
            <div key={member.id} className="timeline-item">
              <div className="timeline-marker">
                <div className="member-avatar">{member.name.charAt(0)}</div>
                <div className="expertise-badge">{member.expertise}</div>
              </div>
              <div className="timeline-content">
                <h3>{member.name}</h3>
                <p className="member-role">{member.role}</p>
                <p className="member-description">{member.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials - New Side-by-Side Layout */}
      <section className="testimonials-showcase">
        <h2 className="section-title">SUCCESS STORIES</h2>
        <div className="testimonials-grid">
          <div className="testimonial-box">
            <div className="testimonial-quote">"</div>
            <p className="testimonial-text">
              AURA FX taught me to break free from bad spending habits and focus on building real wealth. I now have three passive income streams and my financial future looks completely different.
            </p>
            <div className="testimonial-author">
              <span className="author-name">Michael T.</span>
              <span className="author-title">Financial Freedom Journey | Started 2 years ago</span>
            </div>
          </div>
          <div className="testimonial-box">
            <div className="testimonial-quote">"</div>
            <p className="testimonial-text">
              Instead of working for money, I learned how to make money work for me. The multiple streams of knowledge here helped me understand investing, passive income, and generational wealth.
            </p>
            <div className="testimonial-author">
              <span className="author-name">Sophia R.</span>
              <span className="author-title">Entrepreneur | Building Legacy Wealth</span>
            </div>
          </div>
          <div className="testimonial-box">
            <div className="testimonial-quote">"</div>
            <p className="testimonial-text">
              This platform changed my mindset from chasing quick money to building sustainable wealth. No more bad financial habits—just smart strategies that create lasting prosperity for my family.
            </p>
            <div className="testimonial-author">
              <span className="author-name">David K.</span>
              <span className="author-title">Wealth Builder | Creating Generational Impact</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Explore;
