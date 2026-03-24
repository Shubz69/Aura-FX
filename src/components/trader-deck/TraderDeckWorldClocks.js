/**
 * World clocks for Trader Desk — top rail, circular analog faces (IANA + Intl, DST-safe).
 */
import React, { useEffect, useMemo, useState } from 'react';

const ZONES = [
  { label: 'New York', timeZone: 'America/New_York' },
  { label: 'London', timeZone: 'Europe/London' },
  { label: 'Dubai', timeZone: 'Asia/Dubai' },
  { label: 'Tokyo', timeZone: 'Asia/Tokyo' },
  { label: 'Sydney', timeZone: 'Australia/Sydney' },
];

const CX = 50;
const CY = 50;

function getHmsInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const num = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return {
      hour: num('hour'),
      minute: num('minute'),
      second: num('second'),
    };
  } catch {
    return { hour: 0, minute: 0, second: 0 };
  }
}

function formatDigital(date, timeZone) {
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

/** Clockwise degrees from 12 o'clock (SVG rotate positive = clockwise). */
function hourRotationDeg(hour, minute, second) {
  const h = (hour % 12) + minute / 60 + second / 3600;
  return h * 30;
}

function minuteRotationDeg(minute, second) {
  return (minute + second / 60) * 6;
}

function secondRotationDeg(second) {
  return second * 6;
}

function AnalogClockFace({ label, hour, minute, second, digitalTitle }) {
  const hDeg = hourRotationDeg(hour, minute, second);
  const mDeg = minuteRotationDeg(minute, second);
  const sDeg = secondRotationDeg(second);

  const ticks = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i * 30 - 90) * (Math.PI / 180);
    const r0 = 41;
    const r1 = i % 3 === 0 ? 33 : 36;
    ticks.push(
      <line
        key={i}
        x1={CX + r0 * Math.cos(a)}
        y1={CY + r0 * Math.sin(a)}
        x2={CX + r1 * Math.cos(a)}
        y2={CY + r1 * Math.sin(a)}
        className="td-deck-analog-clock__tick"
      />,
    );
  }

  return (
    <div
      className="td-deck-analog-clock"
      title={digitalTitle}
      role="group"
      aria-label={`${label}, ${digitalTitle}`}
    >
      <div className="td-deck-analog-clock__face-wrap">
        <svg
          className="td-deck-analog-clock__svg"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            className="td-deck-analog-clock__rim-outer"
            cx={CX}
            cy={CY}
            r="46"
          />
          <circle
            className="td-deck-analog-clock__rim"
            cx={CX}
            cy={CY}
            r="44"
          />
          <circle
            className="td-deck-analog-clock__dial"
            cx={CX}
            cy={CY}
            r="40"
          />
          {ticks}
          <g transform={`rotate(${hDeg} ${CX} ${CY})`}>
            <line
              className="td-deck-analog-clock__hand td-deck-analog-clock__hand--hour"
              x1={CX}
              y1={CY}
              x2={CX}
              y2={32}
              strokeLinecap="round"
            />
          </g>
          <g transform={`rotate(${mDeg} ${CX} ${CY})`}>
            <line
              className="td-deck-analog-clock__hand td-deck-analog-clock__hand--minute"
              x1={CX}
              y1={CY}
              x2={CX}
              y2={24}
              strokeLinecap="round"
            />
          </g>
          <g transform={`rotate(${sDeg} ${CX} ${CY})`}>
            <line
              className="td-deck-analog-clock__hand td-deck-analog-clock__hand--second"
              x1={CX}
              y1={CY}
              x2={CX}
              y2={22}
              strokeLinecap="round"
            />
          </g>
          <circle className="td-deck-analog-clock__cap" cx={CX} cy={CY} r="3.2" />
        </svg>
      </div>
      <span className="td-deck-analog-clock__city">{label}</span>
    </div>
  );
}

export default function TraderDeckWorldClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const clocks = useMemo(
    () =>
      ZONES.map((z) => {
        const { hour, minute, second } = getHmsInTimeZone(now, z.timeZone);
        const digital = formatDigital(now, z.timeZone);
        return {
          ...z,
          hour,
          minute,
          second,
          digitalTitle: `${digital} · ${z.timeZone}`,
        };
      }),
    [now],
  );

  return (
    <div className="td-deck-world-clocks-rail">
      <div
        className="td-deck-world-clocks td-deck-world-clocks--top"
        aria-label="World clocks"
        aria-live="off"
      >
        {clocks.map(({ label, timeZone, hour, minute, second, digitalTitle }) => (
          <AnalogClockFace
            key={timeZone}
            label={label}
            hour={hour}
            minute={minute}
            second={second}
            digitalTitle={digitalTitle}
          />
        ))}
      </div>
    </div>
  );
}
