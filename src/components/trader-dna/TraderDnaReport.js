import React from 'react';

function ScoreOrb({ label, value, max = 100 }) {
  const v = Math.round(Number(value) || 0);
  return (
    <div className="tdna-score-orb">
      <div className="tdna-score-orb-ring" style={{ '--v': Math.min(max, v) }}>
        <span className="tdna-score-orb-num">{v}</span>
      </div>
      <span className="tdna-score-orb-lbl">{label}</span>
    </div>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`tdna-sec ${className}`}>
      <h3 className="tdna-sec-title">{title}</h3>
      {children}
    </section>
  );
}

export default function TraderDnaReport({ report, nextEligibleAt, cycleDays = 90 }) {
  if (!report) return null;
  const { scores, ratings, archetype, archetypeTagline, identityStatement, headlineSummary, generatedAt } = report;
  const nextDate = nextEligibleAt
    ? new Date(nextEligibleAt).toLocaleDateString(undefined, { dateStyle: 'long' })
    : null;

  return (
    <div className="tdna-report">
      <header className="tdna-hero">
        <div className="tdna-hero-glow" aria-hidden />
        <div className="tdna-hero-top">
          <div>
            <p className="tdna-hero-kicker">Trader archetype</p>
            <h1 className="tdna-hero-arch">{archetype}</h1>
            <p className="tdna-hero-tag">{archetypeTagline}</p>
          </div>
          <div className="tdna-hero-score-block">
            <ScoreOrb label="DNA score" value={scores?.overallDNA} />
          </div>
        </div>
        <p className="tdna-hero-headline">{headlineSummary}</p>
        <p className="tdna-hero-id">{identityStatement}</p>
        <div className="tdna-hero-meta">
          <span>
            Generated{' '}
            {generatedAt
              ? new Date(generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              : '—'}
          </span>
          {nextDate && (
            <span className="tdna-hero-next">Next refresh eligible · {nextDate}</span>
          )}
          {!nextDate && <span className="tdna-hero-next">Cycle · {cycleDays} days</span>}
        </div>
      </header>

      <Section title="Dimensional scores">
        <div className="tdna-score-row">
          <ScoreOrb label="Behaviour" value={scores?.behaviour} />
          <ScoreOrb label="Discipline" value={scores?.discipline} />
          <ScoreOrb label="Execution" value={scores?.execution} />
          <ScoreOrb label="Psychology" value={scores?.psychologyStability} />
          <ScoreOrb label="Consistency" value={scores?.consistency} />
          <ScoreOrb label="Environment" value={scores?.environmentFit} />
          <ScoreOrb label="Performance" value={scores?.performance} />
        </div>
        <div className="tdna-ratings-bar">
          {ratings && (
            <>
              <span>Risk: {ratings.riskProfile}</span>
              <span>Consistency: {ratings.consistency}</span>
              <span>Execution: {ratings.execution}</span>
              <span>Discipline: {ratings.discipline}</span>
              <span>Behavioural: {ratings.behavioural}</span>
            </>
          )}
        </div>
        {report.improvementPriority && (
          <p className="tdna-priority">
            <strong>Improvement priority:</strong> {report.improvementPriority}
          </p>
        )}
      </Section>

      <div className="tdna-two-col">
        <Section title="Strengths">
          <ul className="tdna-list tdna-list--pos">
            {(report.strengths || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
        <Section title="Weaknesses">
          <ul className="tdna-list tdna-list--warn">
            {(report.weaknesses || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Pattern recognition">
        <div className="tdna-card-grid">
          {(report.patternRecognition || []).map((p, i) => (
            <div key={i} className="tdna-card">
              <h4>{p.label}</h4>
              <p>{p.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Psychological tendencies">
        <div className="tdna-psych">
          <div className="tdna-psych-type">{report.psychologicalTendencies?.profileType}</div>
          <ul className="tdna-list">
            {(report.psychologicalTendencies?.tendencies || []).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Execution style">
        <div className="tdna-exec">
          <h4 className="tdna-exec-style">{report.executionStyle?.style}</h4>
          <p>{report.executionStyle?.narrative}</p>
          <div className="tdna-exec-stats">
            <span>Quality {report.executionStyle?.qualityScore}</span>
            <span>Stops {report.executionStyle?.stopConsistency}%</span>
            <span>RR adherence {report.executionStyle?.rrAdherence}</span>
          </div>
        </div>
      </Section>

      <Section title="Environment fit">
        <div className="tdna-env">
          <p>{report.environmentFit?.narrative}</p>
          <div className="tdna-env-grid">
            <div>
              <span className="tdna-env-lbl">Best session</span>
              <span className="tdna-env-val">{report.environmentFit?.bestSession}</span>
            </div>
            <div>
              <span className="tdna-env-lbl">Weakest session</span>
              <span className="tdna-env-val">{report.environmentFit?.worstSession}</span>
            </div>
            <div>
              <span className="tdna-env-lbl">Best regime (inferred)</span>
              <span className="tdna-env-val">{report.environmentFit?.bestMarketRegime}</span>
            </div>
            <div>
              <span className="tdna-env-lbl">Stress regime</span>
              <span className="tdna-env-val">{report.environmentFit?.worstMarketRegime}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Session & instrument insights">
        <div className="tdna-tables">
          <div className="tdna-table-wrap">
            <h4>Sessions</h4>
            <table className="tdna-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Trades</th>
                  <th>WR%</th>
                  <th>Avg checklist</th>
                </tr>
              </thead>
              <tbody>
                {(report.sessionInstrumentInsights?.bySession || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.session}</td>
                    <td>{r.trades}</td>
                    <td>{r.winRate}</td>
                    <td>{r.avgChecklist}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tdna-table-wrap">
            <h4>Instruments</h4>
            <table className="tdna-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Trades</th>
                  <th>WR%</th>
                  <th>Exp (R)</th>
                </tr>
              </thead>
              <tbody>
                {(report.sessionInstrumentInsights?.byPair || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.pair}</td>
                    <td>{r.trades}</td>
                    <td>{r.winRate}</td>
                    <td>{r.expectancyR}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Intelligence narrative">
        <div className="tdna-ai">
          {(report.aiInterpretation || []).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </Section>

      <Section title="Action plan">
        <div className="tdna-action">
          <h4>Top 3 moves</h4>
          <ol className="tdna-ol">
            {(report.actionPlan?.top3 || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
          <div className="tdna-action-cols">
            <div>
              <h4>Reduce</h4>
              <ul className="tdna-list">
                {(report.actionPlan?.reduceBehaviours || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Lean into</h4>
              <ul className="tdna-list tdna-list--pos">
                {(report.actionPlan?.leanInto || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="tdna-action-line">
            <strong>Session focus:</strong> {report.actionPlan?.sessionFocus}
          </p>
          <div className="tdna-action-mini">
            <div>
              <h4>Execution corrections</h4>
              <ul className="tdna-list">
                {(report.actionPlan?.executionCorrections || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Emotional risk controls</h4>
              <ul className="tdna-list">
                {(report.actionPlan?.emotionalRiskControls || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <h4>Next cycle goals</h4>
          <ul className="tdna-list">
            {(report.actionPlan?.nextCycleGoals || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="DNA evolution">
        <div className="tdna-evo">
          <p className="tdna-evo-summary">{report.evolution?.summary}</p>
          {report.evolution?.deltas && (
            <div className="tdna-evo-deltas">
              {Object.entries(report.evolution.deltas).map(([k, v]) => (
                <span key={k} className={v >= 0 ? 'tdna-delta-pos' : 'tdna-delta-neg'}>
                  {k.replace(/([A-Z])/g, ' $1').trim()}: {v >= 0 ? '+' : ''}
                  {v}
                </span>
              ))}
            </div>
          )}
          <p className="tdna-evo-traj">
            Trajectory: <strong>{report.evolution?.trajectory}</strong>
            {report.evolution?.archetypeChanged && (
              <span className="tdna-evo-shift"> · Archetype shifted vs previous cycle</span>
            )}
          </p>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="tdna-alerts">
          {(report.alerts || []).map((a, i) => (
            <div key={i} className={`tdna-alert tdna-alert--${a.level}`}>
              {a.text}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Telemetry detail">
        <div className="tdna-telemetry">
          <div>
            <h4>Behavioural</h4>
            <pre className="tdna-pre">{JSON.stringify(report.behaviouralMetrics, null, 2)}</pre>
          </div>
          <div>
            <h4>Execution</h4>
            <pre className="tdna-pre">{JSON.stringify(report.executionMetrics, null, 2)}</pre>
          </div>
          <div>
            <h4>Performance</h4>
            <pre className="tdna-pre">{JSON.stringify(report.performanceMetrics, null, 2)}</pre>
          </div>
          <div>
            <h4>Psychological</h4>
            <pre className="tdna-pre">{JSON.stringify(report.psychologicalMetrics, null, 2)}</pre>
          </div>
        </div>
      </Section>
    </div>
  );
}
