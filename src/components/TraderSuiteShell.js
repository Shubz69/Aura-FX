import React from 'react';
import AuraTerminalThemeShell from './AuraTerminalThemeShell';
import '../styles/TraderSuite.css';

export default function TraderSuiteShell({
  title,
  eyebrow,
  description,
  stats = [],
  status,
  primaryAction,
  secondaryActions,
  workflowSteps = [],
  railTitle,
  railContent,
  children,
}) {
  return (
    <AuraTerminalThemeShell>
      <div className="trader-suite-page trader-suite-stack">
        <section className="trader-suite-panel trader-suite-shell">
          <div className="trader-suite-shell-grid">
            <div className="trader-suite-shell-main">
              {eyebrow ? <div className="trader-suite-eyebrow">{eyebrow}</div> : null}
              <h1 className="trader-suite-title">{title}</h1>
              {description ? <p className="trader-suite-description">{description}</p> : null}

              {workflowSteps.length ? (
                <div className="trader-suite-step-row" aria-label="Workflow steps">
                  {workflowSteps.map((step) => (
                    <div
                      key={step.label}
                      className={`trader-suite-step${step.active ? ' trader-suite-step--active' : ''}${step.complete ? ' trader-suite-step--complete' : ''}`}
                    >
                      <span className="trader-suite-step-index">{step.index}</span>
                      <span className="trader-suite-step-copy">
                        <strong>{step.label}</strong>
                        {step.note ? <small>{step.note}</small> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="trader-suite-hero-actions">
                {primaryAction ? <div className="trader-suite-primary-action">{primaryAction}</div> : null}
                {secondaryActions ? <div className="trader-suite-secondary-actions">{secondaryActions}</div> : null}
              </div>
            </div>

            <aside className="trader-suite-shell-rail">
              {status ? (
                <div className="trader-suite-status-card">
                  <span className="trader-suite-rail-label">Current status</span>
                  <h3>{status.title}</h3>
                  <p>{status.body}</p>
                </div>
              ) : null}

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

              {railContent ? (
                <div className="trader-suite-highlight">
                  {railTitle ? <span className="trader-suite-rail-label">{railTitle}</span> : null}
                  {railContent}
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        {children}
      </div>
    </AuraTerminalThemeShell>
  );
}
