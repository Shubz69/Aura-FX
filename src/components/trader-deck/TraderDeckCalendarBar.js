/**
 * Compact date bar for Trader Desk. Daily: localized weekday + date (uppercase).
 * Weekly: localized week range. Native date input for jumping to a day (no modal month grid).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

function pickerLocale(lng) {
  if (lng === 'zh-CN') return 'zh-CN';
  if (lng === 'hi') return 'hi-IN';
  if (lng === 'ar') return 'ar';
  if (lng === 'bn') return 'bn-BD';
  if (lng === 'ur') return 'ur-PK';
  return lng || 'en-GB';
}

/** Week start (Monday) for a given date string YYYY-MM-DD */
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Week end (Sunday) for week containing dateStr */
function getWeekEnd(dateStr) {
  const start = getWeekStart(dateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export default function TraderDeckCalendarBar({
  selectedDate,
  period,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  dateMin,
  dateMax,
}) {
  const { t, i18n } = useTranslation();
  const nativeDateRef = useRef(null);
  const loc = pickerLocale(i18n.language);

  useEffect(() => {
    const tid = setTimeout(() => {
      nativeDateRef.current?.blur?.();
    }, 0);
    return () => clearTimeout(tid);
  }, []);

  const label = useMemo(() => {
    const str = String(selectedDate).slice(0, 10);
    const d = new Date(str + 'T12:00:00');
    const dateOpts = { day: 'numeric', month: 'long', year: 'numeric' };

    if (period === 'weekly') {
      const start = getWeekStart(str);
      const end = getWeekEnd(str);
      const a = start.toLocaleDateString(loc, dateOpts);
      const b = end.toLocaleDateString(loc, dateOpts);
      return `${a} – ${b}`.toUpperCase();
    }

    return d.toLocaleDateString(loc, { weekday: 'long', ...dateOpts }).toUpperCase();
  }, [selectedDate, period, loc]);

  const iso = String(selectedDate).slice(0, 10);

  const groupAria = period === 'weekly'
    ? t('traderDeck.calendar.groupAriaWeek', { label })
    : t('traderDeck.calendar.groupAriaDate', { label });

  return (
    <div
      className="td-deck-calendar-bar"
      role="group"
      aria-label={groupAria}
    >
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={() => onPrevMonth()}
        aria-label={period === 'weekly' ? t('traderDeck.calendar.prevWeek') : t('traderDeck.calendar.prevDay')}
      >
        ‹
      </button>
      <span className="td-deck-calendar-bar-label">
        {label}
      </span>
      <input
        type="date"
        className="td-deck-calendar-bar-native-date"
        ref={nativeDateRef}
        value={/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ''}
        min={dateMin}
        max={dateMax}
        onChange={(e) => {
          const v = e.target.value;
          if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) onSelectDate(v);
        }}
        aria-label={period === 'weekly' ? t('traderDeck.calendar.chooseDateWeekly') : t('traderDeck.calendar.chooseDate')}
      />
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={() => onNextMonth()}
        aria-label={period === 'weekly' ? t('traderDeck.calendar.nextWeek') : t('traderDeck.calendar.nextDay')}
      >
        ›
      </button>
    </div>
  );
}
