/**
 * Live world clocks for Trader Desk (IANA zones + Intl — DST handled by the runtime).
 */
import React, { useEffect, useMemo, useState } from 'react';

const ZONES = [
  { label: 'New York', timeZone: 'America/New_York' },
  { label: 'London', timeZone: 'Europe/London' },
  { label: 'Dubai', timeZone: 'Asia/Dubai' },
  { label: 'Tokyo', timeZone: 'Asia/Tokyo' },
  { label: 'Sydney', timeZone: 'Australia/Sydney' },
];

function formatTime(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '—';
  }
}

export default function TraderDeckWorldClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const times = useMemo(
    () => ZONES.map((z) => ({ ...z, time: formatTime(now, z.timeZone) })),
    [now],
  );

  return (
    <div
      className="td-deck-world-clocks"
      aria-label="World clocks"
      aria-live="off"
    >
      {times.map(({ label, timeZone, time }) => (
        <div key={timeZone} className="td-deck-world-clock">
          <span className="td-deck-world-clock__city">{label}</span>
          <span className="td-deck-world-clock__time" title={`${label} (${timeZone})`}>
            {time}
          </span>
        </div>
      ))}
    </div>
  );
}
