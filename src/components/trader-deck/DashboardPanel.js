import React from 'react';

/**
 * Single dashboard card with glowing border and header.
 * Used for Regime, Pulse, Drivers, Signals, Changes, Focus, Radar.
 */
export default function DashboardPanel({ title, children, className = '', wide = false }) {
  return (
    <section
      className={`td-mi-panel ${wide ? 'td-mi-panel--wide' : ''} ${className}`}
      aria-labelledby={title ? `panel-${title.replace(/\s+/g, '-')}` : undefined}
    >
      {title && (
        <h2 id={title ? `panel-${title.replace(/\s+/g, '-')}` : undefined} className="td-mi-panel-title">
          {title}
        </h2>
      )}
      <div className="td-mi-panel-body">{children}</div>
    </section>
  );
}
