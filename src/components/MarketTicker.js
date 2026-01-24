/**
 * MarketTicker - Shared component for live market prices
 * 
 * Features:
 * - Live price updates with green/red flash
 * - Auto-scrolling ticker tape (TradingView style)
 * - Category tabs for filtering
 * - "View All Markets" modal with live prices
 * - Never shows 0.00 - shows loading or delayed indicator
 * - Stale data indicator
 * - Responsive design with proper height/padding
 */

import React, { useState, useCallback, memo } from 'react';
import { useLivePrices } from '../hooks/useLivePrices';
import '../styles/MarketTicker.css';

// Loading placeholder for prices
const PriceLoading = () => (
  <span className="price-loading">
    <span className="loading-dot">•</span>
    <span className="loading-dot">•</span>
    <span className="loading-dot">•</span>
  </span>
);

// Individual ticker item (memoized for performance)
const TickerItem = memo(({ 
  symbol, 
  displayName, 
  price, 
  change, 
  changeSign,
  changePercent, 
  isUp, 
  flash, 
  loading, 
  stale,
  delayed 
}) => {
  const flashClass = flash === 'up' ? 'flash-green' : flash === 'down' ? 'flash-red' : '';
  const hasPrice = price && parseFloat(price) > 0;
  const sign = isUp ? '+' : '';
  
  return (
    <div className={`ticker-item ${flashClass} ${stale ? 'stale' : ''} ${loading ? 'loading' : ''} ${delayed ? 'delayed' : ''}`}>
      <span className="ticker-symbol">{displayName || symbol}</span>
      
      {hasPrice ? (
        <>
          <span className={`ticker-price ${isUp ? 'price-up' : 'price-down'}`}>
            {price}
          </span>
          <span className={`ticker-change ${isUp ? 'ticker-up' : 'ticker-down'}`}>
            {sign}{changePercent}%
          </span>
        </>
      ) : (
        <>
          <span className="ticker-price loading-price">
            <PriceLoading />
          </span>
          <span className="ticker-change ticker-loading">—</span>
        </>
      )}
    </div>
  );
});

// Market item for modal (memoized)
const MarketItem = memo(({ 
  symbol, 
  displayName, 
  price, 
  change,
  changeSign,
  changePercent, 
  isUp, 
  flash, 
  loading,
  delayed 
}) => {
  const flashClass = flash === 'up' ? 'flash-green' : flash === 'down' ? 'flash-red' : '';
  const hasPrice = price && parseFloat(price) > 0;
  
  return (
    <div className={`market-item ${isUp ? 'up' : 'down'} ${flashClass} ${delayed ? 'delayed' : ''}`}>
      <div className="market-item-info">
        <span className="market-item-symbol">{displayName || symbol}</span>
        {delayed && <span className="market-item-delayed">Delayed</span>}
      </div>
      <div className="market-item-price">
        {hasPrice ? (
          <>
            <span className="market-item-value">{price}</span>
            <span className={`market-item-change ${isUp ? 'up' : 'down'}`}>
              {changeSign || (isUp ? '+' : '-')}{change} ({changePercent}%)
            </span>
          </>
        ) : (
          <>
            <span className="market-item-value"><PriceLoading /></span>
            <span className="market-item-change loading">Loading...</span>
          </>
        )}
      </div>
    </div>
  );
});

// View All Markets Modal
const ViewAllModal = memo(({ isOpen, onClose, groupedPrices, stale }) => {
  if (!isOpen) return null;

  return (
    <div className="market-modal-overlay" onClick={onClose}>
      <div className="market-modal" onClick={e => e.stopPropagation()}>
        <div className="market-modal-header">
          <h2>All Markets</h2>
          {stale && <span className="modal-stale-badge">⚠️ Data may be delayed</span>}
          <button className="market-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="market-modal-content">
          {Object.entries(groupedPrices)
            .sort((a, b) => a[1].order - b[1].order)
            .map(([key, group]) => (
              <div key={key} className="market-group">
                <h3 className="market-group-title">
                  <span className="market-group-icon">{group.icon}</span>
                  {group.name}
                </h3>
                <div className="market-group-items">
                  {group.prices.map(item => (
                    <MarketItem
                      key={item.symbol}
                      {...item}
                    />
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
    getPricesGrouped,
    getHealth
  } = useLivePrices({ beginnerMode: !activeCategory, category: activeCategory });

  const pricesArray = getPricesArray();
  const groupedPrices = getPricesGrouped();
  const health = getHealth();

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

  // Check if any prices have data
  const hasAnyData = pricesArray.some(p => p.price && parseFloat(p.price) > 0);

  return (
    <div className={`market-ticker-wrapper ${className} ${stale ? 'stale' : ''} ${!connected && !loading ? 'disconnected' : ''}`}>
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
        <div className={`ticker ${autoScroll && hasAnyData ? 'auto-scroll' : ''}`}>
          {tickerItems.map((item, index) => (
            <TickerItem
              key={`${item.symbol}-${index}`}
              {...item}
              stale={stale}
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
        stale={stale}
      />
    </div>
  );
}

export default memo(MarketTicker);
