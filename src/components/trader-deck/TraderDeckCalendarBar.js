/**
 * Compact month/year bar for Trader Deck. Shows current month with < > arrows.
 * Clicking the bar opens the full calendar overlay to pick an exact date.
 */
import React from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function TraderDeckCalendarBar({
  calendarMonth,
  onPrevMonth,
  onNextMonth,
  onOpenCalendar,
}) {
  const [y, m] = String(calendarMonth).split('-').map(Number);
  const monthLabel = MONTH_NAMES[Math.max(0, m - 1)];
  const year = y || new Date().getFullYear();

  return (
    <div
      className="td-deck-calendar-bar"
      role="button"
      tabIndex={0}
      onClick={onOpenCalendar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCalendar(); } }}
      aria-label={`Current date: ${monthLabel} ${year}. Click to open calendar and pick a date.`}
    >
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={(e) => { e.stopPropagation(); onPrevMonth(); }}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="td-deck-calendar-bar-label">
        {monthLabel.toUpperCase()} {year}
      </span>
      <button
        type="button"
        className="td-deck-calendar-bar-btn"
        onClick={(e) => { e.stopPropagation(); onNextMonth(); }}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
