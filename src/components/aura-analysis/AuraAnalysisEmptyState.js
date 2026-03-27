/**
 * Premium empty / connect states for Aura Analysis dashboard tabs.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/aura-analysis/AuraShared.css';

// MT5 Logo SVG Component
const MT5LogoIcon = ({ variant = 'default' }) => {
  // Modern MT5-inspired logo with chart elements
  if (variant === 'trading') {
    return (
      <svg 
        className="aa-mt5-svg-alt" 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle with subtle gradient */}
        <circle cx="50" cy="50" r="45" fill="url(#grad-bg)" stroke="rgba(234,169,96,0.3)" strokeWidth="1.5"/>
        
        {/* Candlestick chart pattern */}
        <rect x="25" y="35" width="8" height="30" className="mt5-candle-up" rx="2" />
        <rect x="38" y="45" width="8" height="20" className="mt5-candle-down" rx="2" />
        <rect x="51" y="28" width="8" height="37" className="mt5-candle-up" rx="2" />
        <rect x="64" y="40" width="8" height="25" className="mt5-candle-down" rx="2" />
        
        {/* Wick lines */}
        <line x1="29" y1="35" x2="29" y2="25" className="mt5-chart-line" strokeWidth="1.5" />
        <line x1="42" y1="45" x2="42" y2="38" className="mt5-chart-line" strokeWidth="1.5" />
        <line x1="55" y1="28" x2="55" y2="18" className="mt5-chart-line" strokeWidth="1.5" />
        <line x1="68" y1="40" x2="68" y2="32" className="mt5-chart-line" strokeWidth="1.5" />
        
        {/* Trend line */}
        <polyline points="15,70 25,55 38,65 51,48 64,60 75,45 85,55" className="mt5-chart-line" strokeWidth="2" />
        
        {/* MT5 Text */}
        <text x="50" y="88" textAnchor="middle" fill="#eaa960" fontSize="10" fontWeight="bold" letterSpacing="1">
          MT5
        </text>
        
        {/* Gradients */}
        <defs>
          <linearGradient id="grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(234,169,96,0.1)" />
            <stop offset="100%" stopColor="rgba(234,169,96,0.02)" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  
  // Clean, minimal MT5 logo with M and 5 stylized
  if (variant === 'minimal') {
    return (
      <svg 
        className="aa-mt5-svg" 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer ring */}
        <circle cx="50" cy="50" r="42" stroke="url(#grad-gold)" strokeWidth="2" fill="none"/>
        
        {/* M letter stylized as two peaks (chart-like) */}
        <path 
          d="M30 65 L38 45 L46 58 L54 42 L62 55 L70 35" 
          stroke="url(#grad-gold)" 
          strokeWidth="3" 
          strokeLinecap="round"
          fill="none"
        />
        
        {/* 5 digit with trading flair */}
        <path 
          d="M75 58 Q78 52 78 48 Q78 42 72 42 Q68 42 66 45 Q64 48 64 52 Q64 56 66 59 Q68 62 72 62 Q76 62 78 58" 
          stroke="url(#grad-gold)" 
          strokeWidth="2.5" 
          fill="none"
        />
        
        {/* Decorative dots (market data points) */}
        <circle cx="38" cy="45" r="2" fill="#eaa960" />
        <circle cx="46" cy="58" r="2" fill="#eaa960" />
        <circle cx="54" cy="42" r="2" fill="#eaa960" />
        <circle cx="62" cy="55" r="2" fill="#eaa960" />
        
        {/* Gradients */}
        <defs>
          <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8c37d" />
            <stop offset="50%" stopColor="#eaa960" />
            <stop offset="100%" stopColor="#d48d44" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  
  // Default: Bold MT5 logo with chart bar elements
  return (
    <svg 
      className="aa-mt5-svg" 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon shape (trading terminal inspired) */}
      <path 
        d="M50 15 L80 30 L80 70 L50 85 L20 70 L20 30 L50 15" 
        stroke="url(#grad-gold)" 
        strokeWidth="2" 
        fill="url(#grad-bg)"
      />
      
      {/* MT5 Text with modern font */}
      <text x="50" y="55" textAnchor="middle" fill="url(#grad-gold)" fontSize="20" fontWeight="bold" fontFamily="monospace">
        MT5
      </text>
      
      {/* Trading bars (candlesticks) */}
      <rect x="30" y="68" width="5" height="12" fill="url(#grad-gold)" rx="1" />
      <rect x="40" y="62" width="5" height="18" fill="url(#grad-gold)" rx="1" />
      <rect x="50" y="58" width="5" height="22" fill="url(#grad-gold)" rx="1" />
      <rect x="60" y="64" width="5" height="16" fill="url(#grad-gold)" rx="1" />
      <rect x="70" y="70" width="5" height="10" fill="url(#grad-gold)" rx="1" />
      
      {/* Gradients */}
      <defs>
        <linearGradient id="grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8c37d" />
          <stop offset="50%" stopColor="#eaa960" />
          <stop offset="100%" stopColor="#d48d44" />
        </linearGradient>
        <linearGradient id="grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(234,169,96,0.2)" />
          <stop offset="100%" stopColor="rgba(234,169,96,0.05)" />
        </linearGradient>
      </defs>
    </svg>
  );
};

/**
 * @param {'connect' | 'data'} variant
 *   connect — no platform / account; primary CTA to Connection Hub
 *   data    — connected but no trades in range; softer messaging
 */
export default function AuraAnalysisEmptyState({
  icon = 'mt5',  // Changed default from 'fa-plug' to 'mt5'
  title,
  description,
  variant = 'connect',
}) {
  const isConnect = variant === 'connect';
  
  // Render custom MT5 logo or fallback to FontAwesome
  const renderIcon = () => {
    if (icon === 'mt5') {
      return <MT5LogoIcon variant="trading" />;
    }
    if (icon === 'mt5-minimal') {
      return <MT5LogoIcon variant="minimal" />;
    }
    if (icon === 'mt5-bold') {
      return <MT5LogoIcon variant="default" />;
    }
    // Fallback to FontAwesome icon
    return <i className={`fas ${icon}`} />;
  };

  return (
    <div className={`aa-empty-state${isConnect ? ' aa-empty-state--connect' : ' aa-empty-state--data'}`}>
      <div className="aa-empty-state-card">
        <div className="aa-empty-state-card-inner">
          <div className="aa-empty-state-icon-wrap" aria-hidden="true">
            {renderIcon()}
          </div>
          <h2 className="aa-empty-state-title">{title}</h2>
          <p className="aa-empty-state-desc">{description}</p>
          {isConnect ? (
            <>
              <Link to="/aura-analysis/ai" className="aa-empty-state-cta">
                Connect MT5 Account
              </Link>
              <ul className="aa-empty-state-benefits">
                <li>Live balance, equity, and margin</li>
                <li>Performance, risk, and edge analytics</li>
                <li>Session, direction, and symbol breakdowns</li>
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}