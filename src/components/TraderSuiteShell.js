import React from 'react';
import AuraTerminalThemeShell from './AuraTerminalThemeShell';
import '../styles/TraderSuite.css';

export default function TraderSuiteShell({
  title,
  eyebrow,
  description,
  stats = [],
  highlight,
  actions,
  children,
}) {
  return (
    <AuraTerminalThemeShell>
      <div className="trader-suite-page trader-suite-stack">
        <section className="trader-suite-panel trader-suite-shell">
          <div className="trader-suite-hero">
            <div>
              {eyebrow ? <div className="trader-suite-eyebrow">{eyebrow}</div> : null}
              <h1 className="trader-suite-title">{title}</h1>
              {description ? <p className="trader-suite-description">{description}</p> : null}
              {actions ? <div className="trader-suite-hero-actions">{actions}</div> : null}
            </div>

            <div className="trader-suite-hero-side">
              {stats.length ? (
                <div className="trader-suite-stat-grid">
                  {stats.map((stat) => (
                    <div className="trader-suite-stat" key={stat.label}>
                      <span className="trader-suite-stat-label">{stat.label}</span>
                      <span className="trader-suite-stat-value">{stat.value}</span>
                      {stat.note ? <div className="trader-suite-stat-note">{stat.note}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {highlight ? (
                <div className="trader-suite-highlight">
                  <h3>{highlight.title}</h3>
                  <p>{highlight.body}</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {children}
      </div>
    </AuraTerminalThemeShell>
  );
}
