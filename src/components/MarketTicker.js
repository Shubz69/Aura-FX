/**
 * MarketTicker - Shared component for live market prices
 * 
 * Features:
 * - Live price updates with green/red flash
 * - Auto-scrolling ticker tape
 * - Category tabs for filtering
 * - "View All Markets" modal
 * - Stale data indicator
 * - Responsive design
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useLivePrices } from '../hooks/useLivePrices';
import '../styles/MarketTicker.css';

// Individual ticker item (memoized for performance)
const TickerItem = memo(({ symbol, displayName, price, change, changePercent, isUp, flash, loading, stale }) => {
  const flashClass = flash === 'up' ? 'flash-green' : flash === 'down' ? 'flash-red' : '';
  
  return (
    <div className={`ticker-item ${flashClass} ${stale ? 'stale' : ''} ${loading ? 'loading' : ''}`}>
      <span className="ticker-symbol">{displayName || symbol}</span>
      <span className={`ticker-price ${isUp ? 'price-up' : 'price-down'}`}>
        {loading ? '...' : price}
      </span>
      <span className={`ticker-change ${isUp ? 'ticker-up' : 'ticker-down'}`}>
        {loading ? '' : (
          <>
            {isUp ? '▲' : '▼'} {changePercent}%
          </>
        )}
      </span>
    </div>
  );
});

// View All Markets Modal
const ViewAllModal = memo(({ isOpen, onClose, groupedPrices }) => {
  if (!isOpen) return null;

  return (
    <div className="market-modal-overlay" onClick={onClose}>
      <div className="market-modal" onClick={e => e.stopPropagation()}>
        <div className="market-modal-header">
          <h2>All Markets</h2>
          <button className="market-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="market-modal-content">
          {Object.entries(groupedPrices).sort((a, b) => a[1].order - b[1].order).map(([key, group]) => (
            <div key={key} className="market-group">
              <h3 className="market-group-title">
                <span className="market-group-icon">{group.icon}</span>
                {group.name}
              </h3>
              <div className="market-group-items">
                {group.prices.map(item => (
                  <div 
                    key={item.symbol} 
                    className={`market-item ${item.isUp ? 'up' : 'down'} ${item.flash ? `flash-${item.flash === 'up' ? 'green' : 'red'}` : ''}`}
                  >
                    <div className="market-item-info">
                      <span className="market-item-symbol">{item.displayName || item.symbol}</span>
                    </div>
                    <div className="market-item-price">
                      <span className="market-item-value">{item.price || '...'}</span>
                      <span className={`market-item-change ${item.isUp ? 'up' : 'down'}`}>
                        {item.isUp ? '▲' : '▼'} {item.changePercent || '0.00'}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// Category tabs
const CategoryTabs = memo(({ categories, activeCategory, onCategoryChange }) => {
  return (
    <div className="ticker-categories">
      <button
        className={`ticker-category ${!activeCategory ? 'active' : ''}`}
        onClick={() => onCategoryChange(null)}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.key}
          className={`ticker-category ${activeCategory === cat.key ? 'active' : ''}`}
          onClick={() => onCategoryChange(cat.key)}
        >
          {cat.icon} {cat.name}
        </button>
      ))}
    </div>
  );
});

/**
 * MarketTicker Component
 * 
 * @param {Object} props
 * @param {boolean} props.compact - Compact mode (horizontal scrolling ticker)
 * @param {boolean} props.showTabs - Show category tabs
 * @param {boolean} props.showViewAll - Show "View All Markets" button
 * @param {boolean} props.autoScroll - Enable auto-scrolling
 * @param {string} props.className - Additional CSS class
 */
function MarketTicker({
  compact = true,
  showTabs = false,
  showViewAll = true,
  autoScroll = true,
  className = ''
}) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  const {
    loading,
    connected,
    stale,
    watchlist,
    getPricesArray,
    getPricesGrouped
  } = useLivePrices({ beginnerMode: !activeCategory, category: activeCategory });

  const pricesArray = getPricesArray();
  const groupedPrices = getPricesGrouped();

  // Get categories for tabs
  const categories = watchlist?.groups 
    ? Object.entries(watchlist.groups)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([key, group]) => ({ key, name: group.name, icon: group.icon }))
    : [];

  // Handle category change
  const handleCategoryChange = useCallback((category) => {
    setActiveCategory(category);
  }, []);

  // Duplicate items for seamless scrolling
  const tickerItems = autoScroll ? [...pricesArray, ...pricesArray] : pricesArray;

  return (
    <div className={`market-ticker-wrapper ${className} ${stale ? 'stale' : ''}`}>
      {/* Connection/Stale indicator */}
      {stale && (
        <div className="ticker-status stale">
          ⚠️ Data may be delayed
        </div>
      )}
      
      {/* Category tabs */}
      {showTabs && categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
        />
      )}
      
      {/* Ticker tape */}
      <div className={`stock-ticker-compact ${compact ? 'compact' : ''}`}>
        <div className={`ticker ${autoScroll ? 'auto-scroll' : ''}`}>
          {tickerItems.map((item, index) => (
            <TickerItem
              key={`${item.symbol}-${index}`}
              {...item}
              stale={stale}
              loading={loading && !item.price}
            />
          ))}
        </div>
      </div>
      
      {/* View All Markets button */}
      {showViewAll && (
        <button 
          className="view-all-markets-btn"
          onClick={() => setShowModal(true)}
        >
          View All Markets →
        </button>
      )}
      
      {/* Modal */}
      <ViewAllModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        groupedPrices={groupedPrices}
      />
    </div>
  );
}

export default memo(MarketTicker);
