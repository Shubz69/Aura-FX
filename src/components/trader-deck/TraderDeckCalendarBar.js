/**
 * Compact date bar for Trader Deck. Daily: full date (e.g. 12 March 2026).
 * Weekly: week range (e.g. 20th - 27th March 2026). Click opens full calendar overlay.
 */
import React, { useMemo } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n) {
  const d = n % 10;
  const teenth = Math.floor((n % 100) / 10) === 1;
  if (teenth) return `${n}th`;
  if (d === 1) return `${n}st`;
  if (d === 2) return `${n}nd`;
  if (d === 3) return `${n}rd`;
  return `${n}th`;
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
  calendarMonth,
  period,
  onPrevMonth,
  onNextMonth,
  onOpenCalendar,
}) {
  const label = useMemo(() => {
    const str = String(selectedDate).slice(0, 10);
    const [y, m, day] = str.split('-').map(Number);
    const monthName = MONTH_NAMES[Math.max(0, (m || 1) - 1)];
    const year = y || new Date().getFullYear();

    if (period === 'weekly') {
      const start = getWeekStart(str);
      const end = getWeekEnd(str);
      const startDay = start.getDate();
      const endDay = end.getDate();
      const endMonth = MONTH_NAMES[end.getMonth()];
      const endYear = end.getFullYear();
      const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
      if (sameMonth) {
        return `${ordinal(startDay)} - ${ordinal(endDay)} ${monthName} ${year}`;
      }
      return `${ordinal(startDay)} ${monthName} - ${ordinal(endDay)} ${endMonth} ${endYear}`;
    }

    return `${day || 1} ${monthName} ${year}`;
  }, [selectedDate, period]);

  return (
    <div
      className="td-deck-calendar-bar"
      role="button"
      tabIndex={0}
      onClick={onOpenCalendar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCalendar(); } }}
      aria-label={`${period === 'weekly' ? 'Week' : 'Date'}: ${label}. Click to open calendar.`}
    >
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={(e) => { e.stopPropagation(); onPrevMonth(); }}
        aria-label={period === 'weekly' ? 'Previous week' : 'Previous month'}
      >
        ‹
      </button>
      <span className="td-deck-calendar-bar-label">
        {label}
      </span>
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={(e) => { e.stopPropagation(); onNextMonth(); }}
        aria-label={period === 'weekly' ? 'Next week' : 'Next month'}
      >
        ›
      </button>
    </div>
  );
}
