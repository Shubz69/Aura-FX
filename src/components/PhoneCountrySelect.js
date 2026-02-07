/**
 * Phone country/dial code selector.
 * Trigger: flag + code + chevron. Dropdown below with flags, names, codes (reference layout).
 */
import React, { useState, useRef, useEffect } from 'react';
import { COUNTRY_CODES, isoToFlag } from '../utils/countryCodes.js';

const PhoneCountrySelect = ({ value, onChange, disabled, id, className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const filtered = search.trim()
    ? COUNTRY_CODES.filter(
        (c) =>
          (c.label || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.name || c.label || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.code || '').includes(search.replace(/\D/g, ''))
      )
    : COUNTRY_CODES;

  const selected = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];
  const selectedFlag = selected.iso ? isoToFlag(selected.iso) : '';

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
        {selectedFlag && <span className="phone-country-flag" aria-hidden>{selectedFlag}</span>}
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
              filtered.map((c) => {
                const flag = c.iso ? isoToFlag(c.iso) : '';
                const name = c.name || c.label || c.code;
                return (
                  <li
                    key={c.code}
                    role="option"
                    aria-selected={c.code === value}
                    className={`phone-country-item ${c.code === value ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {flag && <span className="phone-country-item-flag" aria-hidden>{flag}</span>}
                    <span className="phone-country-item-label">{name}</span>
                    <span className="phone-country-item-code">{c.code}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PhoneCountrySelect;
