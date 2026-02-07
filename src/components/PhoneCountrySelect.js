/**
 * Phone country/dial code selector.
 * Displays only the dial code (e.g. +44) when closed; dropdown is searchable by country name.
 */
import React, { useState, useRef, useEffect } from 'react';
import { COUNTRY_CODES } from '../utils/countryCodes.js';

const PhoneCountrySelect = ({ value, onChange, disabled, id, className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const filtered = search.trim()
    ? COUNTRY_CODES.filter(
        (c) =>
          c.label.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search.replace(/\D/g, ''))
      )
    : COUNTRY_CODES;

  const selected = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];

  useEffect(() => {
    const onOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`phone-country-select-wrap ${className || ''}`}
    >
      <button
        type="button"
        id={id}
        aria-label="Country code"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="phone-country-trigger"
      >
        <span className="phone-country-value">{value || selected.code}</span>
        <span className="phone-country-chevron" aria-hidden>▼</span>
      </button>
      {open && (
        <div className="phone-country-dropdown" role="listbox">
          <input
            type="text"
            className="phone-country-search"
            placeholder="Search country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            autoFocus
            aria-label="Search country"
          />
          <ul className="phone-country-list">
            {filtered.length === 0 ? (
              <li className="phone-country-item no-results">No matches</li>
            ) : (
              filtered.map(({ code, label }) => (
                <li
                  key={code}
                  role="option"
                  aria-selected={code === value}
                  className={`phone-country-item ${code === value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="phone-country-item-code">{code}</span>
                  <span className="phone-country-item-label">{label}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PhoneCountrySelect;
