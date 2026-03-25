/**
 * Journal-style calendar for Trader Deck (same UI/UX as Journal).
 * Used on all 4 sub-tabs to pick a date and view content for that date.
 */
import React, { useMemo } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isSameDay(a, b) {
  return a && b && String(a).slice(0, 10) === String(b).slice(0, 10);
}

export default function TraderDeckCalendar({
  selectedDate,
  onSelectDate,
  calendarMonth,
  onPrevMonth,
  onNextMonth,
  datesWithContent = {},
  /** YYYY-MM-DD for “today” styling (e.g. ET trading day); defaults to UTC calendar date */
  todayIso,
}) {
  const calendarDays = useMemo(() => {
    const parts = String(calendarMonth).split('-');
    const year = Math.max(1, parseInt(parts[0], 10) || new Date().getFullYear());
    const month1 = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
    const first = new Date(year, month1 - 1, 1);
    const last = new Date(year, month1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const yyyy = String(first.getFullYear());
    const mm = String(first.getMonth() + 1).padStart(2, '0');
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(`${yyyy}-${mm}-${String(d).padStart(2, '0')}`);
    return days;
  }, [calendarMonth]);

  const today = (todayIso && String(todayIso).slice(0, 10)) || new Date().toISOString().slice(0, 10);

  return (
    <div className="journal-calendar">
      <div className="journal-calendar-nav">
        <button type="button" className="journal-calendar-btn" onClick={onPrevMonth} aria-label="Previous month">‹</button>
        <span className="journal-calendar-month">
          {MONTH_NAMES[parseInt(calendarMonth.split('-')[1], 10) - 1]}&nbsp;{calendarMonth.split('-')[0]}
        </span>
        <button type="button" className="journal-calendar-btn" onClick={onNextMonth} aria-label="Next month">›</button>
      </div>
      <div className="journal-calendar-weekdays">
        {DAY_NAMES.map((d) => <span key={d} className="journal-calendar-wd">{d}</span>)}
      </div>
      <div className="journal-calendar-grid">
        {calendarDays.map((dateStr, i) => {
          if (!dateStr) return <div key={`e-${i}`} className="journal-calendar-day journal-calendar-day--empty" />;
          const hasContent = datesWithContent[dateStr];
          const isSelected = isSameDay(dateStr, selectedDate);
          const isToday = isSameDay(dateStr, today);
          return (
            <button
              key={dateStr}
              type="button"
              className={`journal-calendar-day${isSelected ? ' journal-calendar-day--selected' : ''}${isToday ? ' journal-calendar-day--today' : ''}`}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="journal-calendar-day-num">{parseInt(dateStr.slice(-2), 10)}</span>
              {hasContent && <span className="journal-calendar-day-dot" title="Has content">•</span>}
            </button>
          );
        })}
      </div>
      {!isSameDay(selectedDate, today) && (
        <div className="journal-calendar-footer">
          <button
            type="button"
            className="journal-calendar-footer-today-btn"
            onClick={() => onSelectDate(today)}
          >
            Go to today
          </button>
        </div>
      )}
    </div>
  );
}
