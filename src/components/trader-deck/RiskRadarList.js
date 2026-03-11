import React from 'react';

export default function RiskRadarList({ items = [] }) {
  if (!items.length) {
    return (
      <ul className="td-mi-bullets">
        <li className="td-mi-list-empty">No upcoming events</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-bullets">
      {items.map((item, i) => (
        <li key={i} className="td-mi-bullet-item">
          {typeof item === 'string' ? item : item.title || item.text || '—'}
        </li>
      ))}
    </ul>
  );
}
