import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DateTime } from 'luxon';
import { FaCalendarAlt } from 'react-icons/fa';

const PLACEHOLDER = 'dd/mm/yyyy';

function parseToIsoLoose(str) {
  const t = String(str || '').trim();
  if (!t) return '';
  const iso = DateTime.fromISO(t, { zone: 'utc' });
  if (iso.isValid) return iso.toISODate();
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const dt = DateTime.fromObject({ year: y, month: mo, day: d }, { zone: 'utc' });
    if (dt.isValid) return dt.toISODate();
  }
  return null;
}

function formatIsoToDisplay(iso) {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  return dt.isValid ? dt.toFormat('dd/LL/yyyy') : '';
}

function clampViewMonth(dt, minIso, maxIso) {
  let v = dt;
  if (minIso) {
    const m = DateTime.fromISO(minIso, { zone: 'utc' }).startOf('month');
    if (m.isValid && v < m) v = m;
  }
  if (maxIso) {
    const m = DateTime.fromISO(maxIso, { zone: 'utc' }).startOf('month');
    if (m.isValid && v > m) v = m;
  }
  return v;
}

export default function BacktestDateField({
  id: idProp,
  label,
  value,
  onChange,
  minIso = null,
  maxIso = null,
  'aria-label': ariaLabel,
}) {
  const uid = useId();
  const id = idProp || `bt-df-${uid}`;
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const [text, setText] = useState(() => formatIsoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const now = useMemo(() => DateTime.utc(), []);
  const yearLo = now.year - 50;
  const yearHi = now.year + 1;

  const viewMonth = useMemo(() => {
    const fromVal = value ? DateTime.fromISO(value, { zone: 'utc' }) : null;
    const base = fromVal?.isValid ? fromVal.startOf('month') : now.startOf('month');
    return clampViewMonth(base, minIso, maxIso);
  }, [value, now, minIso, maxIso]);

  const [visibleMonth, setVisibleMonth] = useState(viewMonth);
  useEffect(() => {
    setVisibleMonth(viewMonth);
  }, [viewMonth, open]);

  const syncTextFromValue = useCallback((v) => {
    setText(formatIsoToDisplay(v));
    setInvalid(false);
  }, []);

  useEffect(() => {
    syncTextFromValue(value);
  }, [value, syncTextFromValue]);

  const updatePopoverPos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 300);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 6, left, width: w });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePopoverPos();
    const t = () => updatePopoverPos();
    window.addEventListener('scroll', t, true);
    window.addEventListener('resize', t);
    return () => {
      window.removeEventListener('scroll', t, true);
      window.removeEventListener('resize', t);
    };
  }, [open, updatePopoverPos]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commitText = (raw) => {
    const t = String(raw || '').trim();
    if (!t) {
      onChange('');
      setInvalid(false);
      return true;
    }
    const iso = parseToIsoLoose(t);
    if (!iso) {
      setInvalid(true);
      return false;
    }
    let dt = DateTime.fromISO(iso, { zone: 'utc' });
    if (minIso) {
      const m = DateTime.fromISO(minIso, { zone: 'utc' });
      if (m.isValid && dt < m) dt = m;
    }
    if (maxIso) {
      const m = DateTime.fromISO(maxIso, { zone: 'utc' });
      if (m.isValid && dt > m) dt = m;
    }
    onChange(dt.toISODate());
    setInvalid(false);
    return true;
  };

  const isDisabledDay = (day) => {
    const d = day.toISODate();
    if (minIso && d < minIso) return true;
    if (maxIso && d > maxIso) return true;
    return false;
  };

  const gridDays = useMemo(() => {
    const start = visibleMonth.startOf('month');
    const pad = start.weekday - 1;
    let cursor = start.minus({ days: pad });
    const out = [];
    for (let i = 0; i < 42; i += 1) {
      out.push(cursor);
      cursor = cursor.plus({ days: 1 });
    }
    return out;
  }, [visibleMonth]);

  const weekLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const goPrev = () => setVisibleMonth((m) => m.minus({ months: 1 }).startOf('month'));
  const goNext = () => setVisibleMonth((m) => m.plus({ months: 1 }).startOf('month'));

  const pickDay = (day) => {
    if (isDisabledDay(day)) return;
    onChange(day.toISODate());
    setOpen(false);
  };

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        DateTime.fromObject({ year: 2000, month: i + 1, day: 1 }, { zone: 'utc' }).setLocale('en-GB'),
      ),
    [],
  );
  const monthOptions = useMemo(
    () => months.map((dt, i) => ({ v: i + 1, label: dt.toFormat('LLLL') })),
    [months],
  );
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = yearLo; y <= yearHi; y += 1) years.push(y);
    return years;
  }, [yearLo, yearHi]);

  const pop = open
    ? createPortal(
        <div
          ref={popoverRef}
          className="bt-date-popover"
          style={{ top: pos.top, left: pos.left, width: pos.width, minWidth: 300 }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel || label || 'Choose date'}
        >
          <div className="bt-date-popover__head">
            <button type="button" className="bt-date-popover__nav" onClick={goPrev} aria-label="Previous month">
              ‹
            </button>
            <div className="bt-date-popover__selects">
              <label className="bt-date-sr" htmlFor={`${id}-m`}>
                Month
              </label>
              <select
                id={`${id}-m`}
                className="bt-date-popover__select"
                value={visibleMonth.month}
                onChange={(e) => {
                  const mo = parseInt(e.target.value, 10);
                  setVisibleMonth((vm) => vm.set({ month: mo }));
                }}
              >
                {monthOptions.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.label}
                  </option>
                ))}
              </select>
              <label className="bt-date-sr" htmlFor={`${id}-y`}>
                Year
              </label>
              <select
                id={`${id}-y`}
                className="bt-date-popover__select"
                value={visibleMonth.year}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setVisibleMonth((vm) => vm.set({ year: y }));
                }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="bt-date-popover__nav" onClick={goNext} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="bt-date-popover__dow" aria-hidden>
            {weekLetters.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
          <div className="bt-date-popover__grid">
            {gridDays.map((day) => {
              const inMonth = day.month === visibleMonth.month && day.year === visibleMonth.year;
              const dIso = day.toISODate();
              const selected = value && dIso === value;
              const dis = isDisabledDay(day);
              return (
                <button
                  key={dIso + day.toMillis()}
                  type="button"
                  tabIndex={!dis ? 0 : -1}
                  className={[
                    'bt-date-popover__cell',
                    inMonth && 'bt-date-popover__cell--in',
                    !inMonth && 'bt-date-popover__cell--faint',
                    selected && 'bt-date-popover__cell--selected',
                    dis && 'bt-date-popover__cell--blocked',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={dis}
                  onClick={() => pickDay(day)}
                >
                  {day.day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="bt-date-field">
      {label && (
        <label className="bt-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className={['bt-date-field__wrap', invalid && 'bt-date-field__wrap--invalid'].filter(Boolean).join(' ')}
        ref={wrapRef}
      >
        <input
          id={id}
          className="bt-input bt-date-field__input"
          value={text}
          placeholder={PLACEHOLDER}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-label={ariaLabel}
          onChange={(e) => {
            setText(e.target.value);
            if (invalid) setInvalid(false);
          }}
          onBlur={() => {
            if (String(text).trim() === formatIsoToDisplay(value)) return;
            const ok = commitText(text);
            if (!ok) syncTextFromValue(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="bt-date-field__btn"
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          onClick={() => {
            if (open) setOpen(false);
            else {
              updatePopoverPos();
              setOpen(true);
            }
          }}
        >
          <FaCalendarAlt aria-hidden size={14} />
        </button>
      </div>
      {pop}
    </div>
  );
}
