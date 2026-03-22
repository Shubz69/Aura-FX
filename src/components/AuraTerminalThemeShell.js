import React from 'react';
import '../styles/Journal.css';

/**
 * Reuses Journal page space background, star layers, and CSS variable scope
 * so nested content can use .journal-glass-panel and match Aura Journal theming.
 */
export default function AuraTerminalThemeShell({ children, bodyClassName = '' }) {
  return (
    <div className="journal-page aura-terminal-themed">
      <div className="journal-layout journal-layout--terminal">
        <div className={`journal-terminal-body ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
