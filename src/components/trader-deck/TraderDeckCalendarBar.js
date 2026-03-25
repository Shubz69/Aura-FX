/**
 * Compact date bar for Trader Desk. Daily: full date in ALL CAPS (e.g. SUNDAY, 22 MARCH 2026).
 * Weekly: week range in ALL CAPS. Native date input for jumping to a day (no modal month grid).
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
  period,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  dateMin,
  dateMax,
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
        return `${ordinal(startDay)} - ${ordinal(endDay)} ${monthName} ${year}`.toUpperCase();
      }
      return `${ordinal(startDay)} ${monthName} - ${ordinal(endDay)} ${endMonth} ${endYear}`.toUpperCase();
    }

    const d = new Date(str + 'T12:00:00');
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${weekday}, ${day || 1} ${monthName} ${year}`.toUpperCase();
  }, [selectedDate, period]);

  const iso = String(selectedDate).slice(0, 10);

  return (
    <div
      className="td-deck-calendar-bar"
      role="group"
      aria-label={`${period === 'weekly' ? 'Week' : 'Date'}: ${label}`}
    >
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={() => onPrevMonth()}
        aria-label={period === 'weekly' ? 'Previous week' : 'Previous day'}
      >
        ‹
      </button>
      <span className="td-deck-calendar-bar-label">
        {label}
      </span>
      <input
        type="date"
        className="td-deck-calendar-bar-native-date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ''}
        min={dateMin}
        max={dateMax}
        onChange={(e) => {
          const v = e.target.value;
          if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) onSelectDate(v);
        }}
        aria-label={period === 'weekly' ? 'Choose a day (week view follows that day)' : 'Choose date'}
      />
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={() => onNextMonth()}
        aria-label={period === 'weekly' ? 'Next week' : 'Next day'}
      >
        ›
      </button>
    </div>
  );
}
