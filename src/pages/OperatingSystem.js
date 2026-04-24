import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/OperatingSystem.css';

const blocks = [
  {
    title: 'Trader Desk',
    purpose: 'Central workspace for real-time decision-making.',
    does: 'Performance + behaviour context, market pulse/regime, and AI intelligence in one operating surface.',
    outcome: 'Trade with clarity instead of reacting.',
    to: '/trader-deck',
  },
  {
    title: 'Trader DNA',
    purpose: 'Behavioural identity engine.',
    does: 'Profiles behaviour patterns, tracks changes, and highlights strengths/weaknesses over time.',
    outcome: 'Understand who you are as a trader and what to improve.',
    to: '/reports/dna',
  },
  {
    title: 'Live Metrics',
    purpose: 'Real-time performance tracking during live sessions.',
    does: 'Tracks discipline, execution, risk adherence, and deviations while the session is active.',
    outcome: 'Improve during the session, not only after.',
    to: '/live-metrics',
  },
  {
    title: 'The Operator',
    purpose: 'Decision control system before execution.',
    does: 'Validates setup quality against checklist criteria and blocks impulsive trades.',
    outcome: 'Higher quality decisions and fewer avoidable mistakes.',
    to: '/trader-deck/trade-validator/overview',
  },
  {
    title: 'Journal',
    purpose: 'Structured trade logging.',
    does: 'Captures context, reasoning, setup quality, and post-trade outcomes.',
    outcome: 'Build consistency and pattern awareness.',
    to: '/journal',
  },
  {
    title: 'Monthly Statements',
    purpose: 'Performance statement layer.',
    does: 'Summarises consistency, strengths/weaknesses, and behavioural impact monthly.',
    outcome: 'Clear visibility of progress and gaps.',
    to: '/monthly-statements',
  },
  {
    title: 'Trader CV',
    purpose: 'Professional performance resume.',
    does: 'Displays discipline, quality, and consistency metrics in a shareable format.',
    outcome: 'Build external credibility as an operator.',
    to: '/trader-deck/trade-validator/trader-cv',
  },
  {
    title: 'Trader Passport',
    purpose: 'Identity layer for progression and verification.',
    does: 'Combines profile, behaviour, and performance milestones into one identity view.',
    outcome: 'Become a recognised operator with trackable progression.',
    to: '/trader-passport',
  },
  {
    title: 'Community',
    purpose: 'Performance accountability network.',
    does: 'Daily check-ins, standards, and focused performance conversations.',
    outcome: 'Improve consistency through environment and accountability.',
    to: '/community',
  },
];

export default function OperatingSystem() {
  return (
    <div className="ops-page">
      <section className="ops-hero">
        <p className="ops-kicker">Aura Terminal™</p>
        <h1>The Trader Performance Operating System</h1>
        <p>Where retail traders become professional operators.</p>
      </section>

      <section className="ops-core">
        <h2>Problem</h2>
        <p>Most traders do not have a system. They rely on habits, emotions, and guesswork, which creates inconsistency and repeated mistakes.</p>
        <h2>Solution</h2>
        <p>Aura Terminal™ connects behaviour, discipline, execution, and performance inside one structured operating environment.</p>
      </section>

      <section className="ops-grid">
        {blocks.map((b) => (
          <article key={b.title} className="ops-card">
            <h3>{b.title}</h3>
            <p><strong>Purpose:</strong> {b.purpose}</p>
            <p><strong>What it does:</strong> {b.does}</p>
            <p><strong>Outcome:</strong> {b.outcome}</p>
            <Link to={b.to}>Open {b.title}</Link>
          </article>
        ))}
      </section>

      <section className="ops-flow">
        <h2>System Flow</h2>
        <p>Journal → Live Metrics → The Operator → Trader DNA → Monthly Statements → Trader CV / Passport → Trader Desk</p>
      </section>
    </div>
  );
}
