import React from 'react';
import { useLocation } from 'react-router-dom';
import AuraTerminalThemeShell from './AuraTerminalThemeShell';
import MetricTooltip from '../lib/trader-playbook/MetricTooltip';
import '../styles/TraderSuite.css';

export default function TraderSuiteShell({
  title,
  eyebrow,
  /** Optional mark before the centered title (e.g. logo) — terminal variant only */
  terminalTitlePrefix,
  /** Shown under welcome / eyebrow on terminal variant (e.g. tagline) */
  terminalSubtitle,
  description,
  stats = [],
  status,
  primaryAction,
  secondaryActions,
  workflowSteps = [],
  railTitle,
  railContent,
  variant,
  /** When variant is terminal, use Aura Analysis–style header (premium dashboard) instead of compact terminal bar */
  terminalPresentation = 'classic',
  children,
}) {
  const { pathname } = useLocation();
  const embedInOperator = pathname.startsWith('/trader-deck/trade-validator');
  const embedInAuraDashboardReplay = /^\/aura-analysis\/dashboard\/trader-replay/.test(pathname);
  const skipOuterTheme = embedInOperator || embedInAuraDashboardReplay;

  const statToneClass = (tone) => {
    if (tone === 'gold') return 'aura-db-replay-stat__value--gold';
    if (tone === 'green') return 'aura-db-replay-stat__value--green';
    return undefined;
  };

// In TraderSuiteShell.js, modify the terminalChrome section (around line 30-50)

const terminalChrome = (
  <section className="trader-suite-panel trader-suite-shell trader-suite-shell--terminal">
    <div className="trader-suite-terminal-bar">
      <div className="trader-suite-terminal-left">
        {eyebrow || 'Aura Terminal'}
        {terminalSubtitle ? (
          <div className="trader-suite-terminal-subtitle">{terminalSubtitle}</div>
        ) : null}
      </div>
      <div className="trader-suite-terminal-title">
        {terminalTitlePrefix ? (
          <span className="trader-suite-terminal-title-inner">
            {terminalTitlePrefix}
            <span className="trader-suite-terminal-title-text">{title}</span>
          </span>
        ) : (
          title
        )}
      </div>
      <div className="trader-suite-terminal-actions">
        {primaryAction}
        {secondaryActions}
      </div>
    </div>
    {stats.length ? (
      <div className="trader-suite-terminal-stats">
        {stats.map((stat) => (
          <div className="trader-suite-terminal-stat" key={stat.label}>
            <span className="trader-suite-terminal-stat__label">
              {stat.label}
              {stat.metricId ? <MetricTooltip metricId={stat.metricId} /> : null}
            </span>
            <strong
              className={
                stat.tone === 'gold'
                  ? 'trader-suite-terminal-stat__value--gold'
                  : stat.tone === 'green'
                    ? 'trader-suite-terminal-stat__value--green'
                    : undefined
              }
            >
              {stat.value}
            </strong>
          </div>
        ))}
      </div>
    ) : null}
    {description ? <p className="trader-suite-terminal-description">{description}</p> : null}
    {children}
  </section>
);

  /** Aura dashboard: same page chrome as Overview / Performance — no nested Trader Suite glass panel */
  const auraDashboardTerminal = (
    <div className="aura-db-replay-page">
      <header className="aura-db-replay-header">
        <div className="aura-db-replay-header-top">
          <div className="aura-db-replay-eyebrow">{eyebrow || 'Aura Terminal'}</div>
          <h1 className="aura-db-replay-title">
            {terminalTitlePrefix ? (
              <span className="aura-db-replay-title-inner">
                {terminalTitlePrefix}
                <span className="aura-db-replay-title-text">{title}</span>
              </span>
            ) : (
              title
            )}
          </h1>
          <div className="aura-db-replay-actions">
            {primaryAction}
            {secondaryActions}
          </div>
        </div>
        {terminalSubtitle ? (
          <div className="aura-db-replay-subtitle">{terminalSubtitle}</div>
        ) : null}
        {stats.length ? (
          <div className="aura-db-replay-stats">
            {stats.map((stat) => (
              <div className="aura-db-replay-stat" key={stat.label}>
                <span className="aura-db-replay-stat__label">
                  {stat.label}
                  {stat.metricId ? <MetricTooltip metricId={stat.metricId} /> : null}
                </span>
                <strong className={statToneClass(stat.tone)}>{stat.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {description ? <p className="aura-db-replay-desc">{description}</p> : null}
      </header>
      {children}
    </div>
  );

  const inner = (
      <div
        className={
          embedInAuraDashboardReplay
            ? 'trader-suite-page trader-suite-stack trader-suite-page--aura-dashboard'
            : 'trader-suite-page trader-suite-stack'
        }
      >
        {variant === 'terminal' ? (
          embedInAuraDashboardReplay || terminalPresentation === 'aura-dashboard' ? auraDashboardTerminal : terminalChrome
        ) : (
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
        )}

        {variant === 'terminal' ? null : children}
      </div>
  );

  if (skipOuterTheme) return inner;
  return <AuraTerminalThemeShell>{inner}</AuraTerminalThemeShell>;
}
