/**
 * Phone country/dial code selector.
 * Trigger: flag + code + chevron. Dropdown below with flags, names, codes.
 * Uses Portal so dropdown fully displays on all devices (phones, laptops, PCs).
 */
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COUNTRY_CODES, isoToFlag } from '../utils/countryCodes.js';

const PhoneCountrySelect = ({ value, onChange, disabled, id, className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

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

  const updateDropdownPosition = () => {
    if (triggerRef.current && open) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.min(280, window.innerWidth - 32);
      let top = rect.bottom + 6;
      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 16) left = window.innerWidth - dropdownWidth - 16;
      if (left < 16) left = 16;
      const maxHeight = Math.min(320, window.innerHeight - top - 16);
      setDropdownStyle({ top, left, width: dropdownWidth, maxHeight });
    }
  };

  useEffect(() => {
    if (open) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true);
        window.removeEventListener('resize', updateDropdownPosition);
      };
    }
  }, [open]);

  useEffect(() => {
    const onOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const dropdown = document.querySelector('.phone-country-dropdown-portal');
        if (dropdown && !dropdown.contains(e.target)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, []);

  const dropdownContent = open && (
    <div
      className="phone-country-dropdown phone-country-dropdown-portal"
      role="listbox"
      style={{
        position: 'fixed',
        ...dropdownStyle,
      }}
    >
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
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`phone-country-select-wrap ${className || ''}`}
      >
        <button
          ref={triggerRef}
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
      </div>
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </>
  );
};

export default PhoneCountrySelect;
