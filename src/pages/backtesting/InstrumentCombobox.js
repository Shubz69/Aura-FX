import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getTerminalInstrumentSearchRows } from '../../data/terminalInstruments';

/** Shown when the field is focused and the query is empty (matches product fallback list). */
const POPULAR_IDS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'NZDUSD',
  'USDCAD',
  'EURJPY',
  'EURGBP',
  'GBPJPY',
  'AUDJPY',
  'XAUUSD',
  'XAGUSD',
  'US30',
  'NAS100',
  'US500',
  'BTCUSD',
  'ETHUSD',
];

function filterRows(allRows, query, max) {
  const t = query.trim().toLowerCase();
  if (!t) {
    const popular = POPULAR_IDS.map((id) => allRows.find((r) => r.id === id)).filter(Boolean);
    return popular.length ? popular : allRows.slice(0, 24);
  }
  const scored = [];
  for (const r of allRows) {
    const idLower = r.id.toLowerCase();
    if (!r.haystack.includes(t) && !idLower.includes(t)) continue;
    let pri = 4;
    if (idLower === t) pri = 0;
    else if (idLower.startsWith(t)) pri = 1;
    else if (idLower.includes(t)) pri = 2;
    else pri = 3;
    scored.push({ r, pri });
  }
  scored.sort((a, b) => a.pri - b.pri || a.r.id.localeCompare(b.r.id));
  return scored.slice(0, max).map((x) => x.r);
}

export default function InstrumentCombobox({ value, onChange, disabled }) {
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const valueRef = useRef(value);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rows = useMemo(() => getTerminalInstrumentSearchRows(), []);
  const filtered = useMemo(() => filterRows(rows, value, 80), [rows, value]);
  const showMenu = open && filtered.length > 0;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setActiveIndex((i) => {
      if (!filtered.length) return 0;
      return Math.min(Math.max(0, i), filtered.length - 1);
    });
  }, [filtered]);

  useEffect(() => {
    if (!showMenu) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const el = menuRef.current?.querySelector('.bt-instrument-combobox__option--active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, showMenu, filtered]);

  const commitUppercase = useCallback(() => {
    const next = String(valueRef.current || '').trim().toUpperCase();
    onChange(next);
  }, [onChange]);

  const selectRow = useCallback(
    (row) => {
      if (!row) return;
      onChange(row.id);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!open) setOpen(true);
        e.preventDefault();
        if (!filtered.length) return;
        if (e.key === 'ArrowDown') {
          setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        } else {
          setActiveIndex((i) => Math.max(0, i - 1));
        }
        return;
      }
      if (e.key === 'Escape') {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        return;
      }
      if (e.key === 'Enter') {
        if (open && filtered[activeIndex]) {
          e.preventDefault();
          selectRow(filtered[activeIndex]);
        }
        return;
      }
      if (e.key === 'Tab' && open) {
        setOpen(false);
      }
    },
    [activeIndex, filtered, open, selectRow],
  );

  return (
    <div className="bt-instrument-combobox" ref={wrapRef}>
      <label className="bt-label" htmlFor={inputId}>
        Instrument
      </label>
      <div className="bt-instrument-combobox__wrap">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="bt-input"
          disabled={disabled}
          value={value}
          placeholder="EURUSD"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!wrapRef.current?.contains(document.activeElement)) {
                setOpen(false);
                commitUppercase();
              }
            }, 120);
          }}
          onKeyDown={onKeyDown}
        />
        {showMenu ? (
          <div
            id={listboxId}
            ref={menuRef}
            className="bt-instrument-combobox__menu"
            role="listbox"
            aria-label="Instrument suggestions"
          >
            {filtered.map((row, i) => (
              <div
                key={row.id}
                role="option"
                aria-selected={i === activeIndex}
                className={`bt-instrument-combobox__option${i === activeIndex ? ' bt-instrument-combobox__option--active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectRow(row);
                }}
              >
                <span className="bt-instrument-combobox__sym">{row.id}</span>
                <small className="bt-instrument-combobox__meta" title={row.label}>
                  {[row.category, row.label].filter(Boolean).join(' · ')}
                </small>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
