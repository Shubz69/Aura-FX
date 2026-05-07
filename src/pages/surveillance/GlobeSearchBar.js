import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './GlobeSearchBar.css';

// Country database with ISO codes and common names
const COUNTRIES_DATABASE = [
  { name: 'United States', iso: 'US', lat: 37.0902, lng: -95.7129, region: 'North America' },
  { name: 'United Kingdom', iso: 'GB', lat: 55.3781, lng: -3.4360, region: 'Europe' },
  { name: 'France', iso: 'FR', lat: 46.6034, lng: 1.8883, region: 'Europe' },
  { name: 'Germany', iso: 'DE', lat: 51.1657, lng: 10.4515, region: 'Europe' },
  { name: 'Italy', iso: 'IT', lat: 41.8719, lng: 12.5674, region: 'Europe' },
  { name: 'Spain', iso: 'ES', lat: 40.4637, lng: -3.7492, region: 'Europe' },
  { name: 'Portugal', iso: 'PT', lat: 39.3999, lng: -8.2245, region: 'Europe' },
  { name: 'Netherlands', iso: 'NL', lat: 52.1326, lng: 5.2913, region: 'Europe' },
  { name: 'Belgium', iso: 'BE', lat: 50.5039, lng: 4.4699, region: 'Europe' },
  { name: 'Switzerland', iso: 'CH', lat: 46.8182, lng: 8.2275, region: 'Europe' },
  { name: 'Austria', iso: 'AT', lat: 47.5162, lng: 14.5501, region: 'Europe' },
  { name: 'Poland', iso: 'PL', lat: 51.9194, lng: 19.1451, region: 'Europe' },
  { name: 'Ukraine', iso: 'UA', lat: 48.3794, lng: 31.1656, region: 'Europe' },
  { name: 'Romania', iso: 'RO', lat: 45.9432, lng: 24.9668, region: 'Europe' },
  { name: 'Sweden', iso: 'SE', lat: 60.1282, lng: 18.6435, region: 'Europe' },
  { name: 'Norway', iso: 'NO', lat: 60.4720, lng: 8.4689, region: 'Europe' },
  { name: 'Finland', iso: 'FI', lat: 61.9241, lng: 25.7482, region: 'Europe' },
  { name: 'Denmark', iso: 'DK', lat: 56.2639, lng: 9.5018, region: 'Europe' },
  { name: 'Greece', iso: 'GR', lat: 39.0742, lng: 21.8243, region: 'Europe' },
  { name: 'Turkey', iso: 'TR', lat: 38.9637, lng: 35.2433, region: 'Asia/Europe' },
  { name: 'Russia', iso: 'RU', lat: 61.5240, lng: 105.3188, region: 'Europe/Asia' },
  { name: 'China', iso: 'CN', lat: 35.8617, lng: 104.1954, region: 'Asia' },
  { name: 'Japan', iso: 'JP', lat: 36.2048, lng: 138.2529, region: 'Asia' },
  { name: 'South Korea', iso: 'KR', lat: 35.9078, lng: 127.7669, region: 'Asia' },
  { name: 'North Korea', iso: 'KP', lat: 40.3399, lng: 127.5101, region: 'Asia' },
  { name: 'India', iso: 'IN', lat: 20.5937, lng: 78.9629, region: 'Asia' },
  { name: 'Pakistan', iso: 'PK', lat: 30.3753, lng: 69.3451, region: 'Asia' },
  { name: 'Bangladesh', iso: 'BD', lat: 23.6850, lng: 90.3563, region: 'Asia' },
  { name: 'Indonesia', iso: 'ID', lat: -0.7893, lng: 113.9213, region: 'Asia' },
  { name: 'Philippines', iso: 'PH', lat: 12.8797, lng: 121.7740, region: 'Asia' },
  { name: 'Vietnam', iso: 'VN', lat: 14.0583, lng: 108.2772, region: 'Asia' },
  { name: 'Thailand', iso: 'TH', lat: 15.8700, lng: 100.9925, region: 'Asia' },
  { name: 'Malaysia', iso: 'MY', lat: 4.2105, lng: 101.9758, region: 'Asia' },
  { name: 'Singapore', iso: 'SG', lat: 1.3521, lng: 103.8198, region: 'Asia' },
  { name: 'Taiwan', iso: 'TW', lat: 23.6978, lng: 120.9605, region: 'Asia' },
  { name: 'Australia', iso: 'AU', lat: -25.2744, lng: 133.7751, region: 'Oceania' },
  { name: 'New Zealand', iso: 'NZ', lat: -40.9006, lng: 174.8860, region: 'Oceania' },
  { name: 'Brazil', iso: 'BR', lat: -14.2350, lng: -51.9253, region: 'South America' },
  { name: 'Argentina', iso: 'AR', lat: -38.4161, lng: -63.6167, region: 'South America' },
  { name: 'Chile', iso: 'CL', lat: -35.6751, lng: -71.5430, region: 'South America' },
  { name: 'Colombia', iso: 'CO', lat: 4.5709, lng: -74.2973, region: 'South America' },
  { name: 'Peru', iso: 'PE', lat: -9.1900, lng: -75.0152, region: 'South America' },
  { name: 'Venezuela', iso: 'VE', lat: 6.4238, lng: -66.5897, region: 'South America' },
  { name: 'Mexico', iso: 'MX', lat: 23.6345, lng: -102.5528, region: 'North America' },
  { name: 'Canada', iso: 'CA', lat: 56.1304, lng: -106.3468, region: 'North America' },
  { name: 'South Africa', iso: 'ZA', lat: -30.5595, lng: 22.9375, region: 'Africa' },
  { name: 'Nigeria', iso: 'NG', lat: 9.0820, lng: 8.6753, region: 'Africa' },
  { name: 'Egypt', iso: 'EG', lat: 26.8206, lng: 30.8025, region: 'Africa' },
  { name: 'Kenya', iso: 'KE', lat: -0.0236, lng: 37.9062, region: 'Africa' },
  { name: 'Ethiopia', iso: 'ET', lat: 9.1450, lng: 40.4897, region: 'Africa' },
  { name: 'Saudi Arabia', iso: 'SA', lat: 23.8859, lng: 45.0792, region: 'Middle East' },
  { name: 'UAE', iso: 'AE', lat: 23.4241, lng: 53.8478, region: 'Middle East' },
  { name: 'Iran', iso: 'IR', lat: 32.4279, lng: 53.6880, region: 'Middle East' },
  { name: 'Iraq', iso: 'IQ', lat: 33.2232, lng: 43.6793, region: 'Middle East' },
  { name: 'Israel', iso: 'IL', lat: 31.0461, lng: 34.8516, region: 'Middle East' },
  { name: 'Syria', iso: 'SY', lat: 34.8021, lng: 38.9968, region: 'Middle East' },
  { name: 'Yemen', iso: 'YE', lat: 15.5527, lng: 48.5164, region: 'Middle East' },
  { name: 'Afghanistan', iso: 'AF', lat: 33.9391, lng: 67.7100, region: 'Asia' },
  { name: 'Myanmar', iso: 'MM', lat: 21.9162, lng: 95.9560, region: 'Asia' },
  { name: 'Kazakhstan', iso: 'KZ', lat: 48.0196, lng: 66.9237, region: 'Asia' },
  { name: 'Uzbekistan', iso: 'UZ', lat: 41.3775, lng: 64.5853, region: 'Asia' },
  { name: 'Cuba', iso: 'CU', lat: 21.5218, lng: -77.7812, region: 'Caribbean' },
  { name: 'Panama', iso: 'PA', lat: 8.5380, lng: -80.7821, region: 'Central America' },
  { name: 'Morocco', iso: 'MA', lat: 31.7917, lng: -7.0926, region: 'Africa' },
  { name: 'Algeria', iso: 'DZ', lat: 28.0339, lng: 1.6596, region: 'Africa' },
  { name: 'Libya', iso: 'LY', lat: 26.3351, lng: 17.2283, region: 'Africa' },
  { name: 'Sudan', iso: 'SD', lat: 12.8628, lng: 30.2176, region: 'Africa' },
  { name: 'Somalia', iso: 'SO', lat: 5.1521, lng: 46.1996, region: 'Africa' },
  { name: 'DR Congo', iso: 'CD', lat: -4.0383, lng: 21.7587, region: 'Africa' },
  { name: 'Angola', iso: 'AO', lat: -11.2027, lng: 17.8739, region: 'Africa' },
  { name: 'Mozambique', iso: 'MZ', lat: -18.6657, lng: 35.5296, region: 'Africa' },
  { name: 'Qatar', iso: 'QA', lat: 25.3548, lng: 51.1839, region: 'Middle East' },
  { name: 'Kuwait', iso: 'KW', lat: 29.3117, lng: 47.4818, region: 'Middle East' },
  { name: 'Oman', iso: 'OM', lat: 21.5126, lng: 55.9233, region: 'Middle East' },
  { name: 'Bahrain', iso: 'BH', lat: 25.9304, lng: 50.6378, region: 'Middle East' },
  { name: 'Jordan', iso: 'JO', lat: 30.5852, lng: 36.2384, region: 'Middle East' },
  { name: 'Lebanon', iso: 'LB', lat: 33.8547, lng: 35.8623, region: 'Middle East' },
];

export default function GlobeSearchBar({ 
  onCountrySelect, 
  onSearchFocus,
  activeCategory = 'all',
  focusRegion = null 
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  // Filter countries based on search query
  const filteredCountries = useMemo(() => {
    if (!query.trim()) return [];
    
    const searchTerm = query.toLowerCase().trim();
    return COUNTRIES_DATABASE
      .filter(country => 
        country.name.toLowerCase().includes(searchTerm) ||
        country.iso.toLowerCase().includes(searchTerm) ||
        country.region.toLowerCase().includes(searchTerm)
      )
      .slice(0, 8); // Limit to 8 results for better UX
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen || filteredCountries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCountries.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && filteredCountries[selectedIndex]) {
          handleSelect(filteredCountries[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  }, [isOpen, filteredCountries, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle country selection
  const handleSelect = useCallback((country) => {
    if (onCountrySelect) {
      onCountrySelect(country);
    }
    setQuery(country.name);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  }, [onCountrySelect]);

  // Handle input change
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(value.trim().length > 0);
    setSelectedIndex(-1);
  }, []);

  // Handle input focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (query.trim().length > 0) {
      setIsOpen(true);
    }
    if (onSearchFocus) {
      onSearchFocus(true);
    }
  }, [query, onSearchFocus]);

  // Handle input blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (onSearchFocus) {
      onSearchFocus(false);
    }
    // Delay closing to allow click on dropdown items
    setTimeout(() => {
      setIsOpen(false);
    }, 200);
  }, [onSearchFocus]);

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, []);

  // Get region emoji
  const getRegionIcon = (region) => {
    const icons = {
      'Europe': '🇪🇺',
      'Asia': '🌏',
      'Asia/Europe': '🌍',
      'Europe/Asia': '🌍',
      'North America': '🌎',
      'South America': '🌎',
      'Africa': '🌍',
      'Middle East': '🌏',
      'Oceania': '🏝️',
      'Caribbean': '🌴',
      'Central America': '🌎',
    };
    return icons[region] || '🌐';
  };

  return (
    <div 
      ref={containerRef}
      className={`globe-search-container ${isFocused ? 'globe-search--focused' : ''} ${isOpen ? 'globe-search--open' : ''}`}
    >
      <div className="globe-search-input-wrapper">
        <svg 
          className="globe-search-icon" 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        
        <input
          ref={inputRef}
          type="text"
          className="globe-search-input"
          placeholder="Search countries..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label="Search countries on globe"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="globe-search-results"
          role="combobox"
        />
        
        {query && (
          <button
            type="button"
            className="globe-search-clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        
        {isFocused && (
          <div className="globe-search-shortcut">
            <kbd>⌘</kbd><kbd>K</kbd>
          </div>
        )}
      </div>

      {isOpen && filteredCountries.length > 0 && (
        <div className="globe-search-dropdown">
          <div className="globe-search-dropdown-header">
            <span>Countries</span>
            <span className="globe-search-count">{filteredCountries.length} results</span>
          </div>
          <ul 
            id="globe-search-results"
            ref={listRef}
            className="globe-search-results"
            role="listbox"
            aria-label="Search results"
          >
            {filteredCountries.map((country, index) => (
              <li
                key={country.iso}
                role="option"
                aria-selected={index === selectedIndex}
                className={`globe-search-result-item ${index === selectedIndex ? 'globe-search-result--selected' : ''} ${focusRegion === country.iso ? 'globe-search-result--active' : ''}`}
                onClick={() => handleSelect(country)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="globe-search-result-icon">
                  {getRegionIcon(country.region)}
                </span>
                <div className="globe-search-result-content">
                  <span className="globe-search-result-name">{country.name}</span>
                  <span className="globe-search-result-meta">
                    {country.iso} · {country.region}
                  </span>
                </div>
                {focusRegion === country.iso && (
                  <span className="globe-search-result-badge" title="Currently focused">
                    ●
                  </span>
                )}
                <span className="globe-search-result-action">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && query.trim() && filteredCountries.length === 0 && (
        <div className="globe-search-dropdown">
          <div className="globe-search-no-results">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <p>No countries found</p>
            <span>Try a different search term</span>
          </div>
        </div>
      )}
    </div>
  );
}