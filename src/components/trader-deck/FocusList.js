import React from 'react';

export default function FocusList({ items = [] }) {
  if (!items.length) {
    return (
      <ul className="td-mi-bullets">
        <li className="td-mi-list-empty">No focus items</li>
      </ul>
    );
  }
  return (
    <ul className="td-mi-bullets td-mi-bullets--focus">
      {items.map((item, i) => {
        const title = typeof item === 'string' ? item : item.title || item.text || '—';
        const reason = typeof item === 'object' && item && item.reason ? String(item.reason) : '';
        return (
          <li key={i} className="td-mi-bullet-item td-mi-bullet-item--focus">
            <span className="td-mi-focus-title">{title}</span>
            {reason ? <span className="td-mi-focus-reason">{reason}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
