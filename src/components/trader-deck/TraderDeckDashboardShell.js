import React from 'react';

/**
 * Outer glowing frame and title for the Market Intelligence dashboard.
 * Wraps the grid of panels; provides the "strong purple outer frame" and contained layout.
 */
export default function TraderDeckDashboardShell({ title = 'Aurax Trader Deck Market Intelligence', children }) {
  return (
    <div className="td-mi-shell">
      <div className="td-mi-shell-glow" aria-hidden />
      <div className="td-mi-shell-inner">
        {title && (
          <header className="td-mi-shell-header">
            <h1 className="td-mi-shell-title">{title}</h1>
          </header>
        )}
        <div className="td-mi-grid">
          {children}
        </div>
      </div>
    </div>
  );
}
