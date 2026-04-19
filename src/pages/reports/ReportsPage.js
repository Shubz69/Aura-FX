/**
 * ReportsPage — role-aware monthly AI report hub.
 * Free   → locked / upsell
 * Premium → eligibility + CSV upload flow + report list
 * Elite  → automated dashboard + report list
 * Admin  → same as elite
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ReportsHubSubNav from '../../components/reports/ReportsHubSubNav';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import { useReportsEligibility } from './useReportsEligibility';
import '../../styles/reports/ReportsPage.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function reportPhaseLabel(phase) {
  if (phase === 'month_open') return 'Month opener';
  return 'Month close';
}

/* ── Eligibility status bar ─────────────────────────────────────────── */
function EligibilityBar({ eligibility }) {
  const { dataDays, isEligible, minDataDays, tradeCount, chartCheckCount } = eligibility;
  const pct = Math.min(100, Math.round((dataDays / minDataDays) * 100));

  return (
    <div className="rp-eligibility">
      <div className="rp-eligibility-left">
        <div className={`rp-eligibility-status ${isEligible ? 'rp-eligibility-status--ready' : 'rp-eligibility-status--wait'}`}>
          {isEligible ? '✓ Eligible for reports' : `${dataDays} / ${minDataDays} days of data`}
        </div>
        {!isEligible && (
          <p className="rp-eligibility-hint">
            You need <strong>{minDataDays} days</strong> of data before your first report can be generated.
            You currently have <strong>{dataDays} days</strong> (from your first logged trade, daily journal entry, or AI chart check until today).
          </p>
        )}
      </div>
      <div className="rp-eligibility-stats">
        <div className="rp-stat"><span className="rp-stat-val">{tradeCount}</span><span className="rp-stat-lbl">Trades Logged</span></div>
        <div className="rp-stat"><span className="rp-stat-val">{chartCheckCount}</span><span className="rp-stat-lbl">AI Chart Checks</span></div>
      </div>
      {!isEligible && (
        <div className="rp-progress-wrap">
          <div className="rp-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/* ── Report viewer ──────────────────────────────────────────────────── */
function ReportViewer({ report, onClose }) {
  const c = report?.content && typeof report.content === 'object' ? report.content : report || {};

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>${c.coverTitle || 'Monthly Report'}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
        h1 { color: #4c1d95; } h2 { color: #b47830; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
        h3 { color: #6b4423; } .section { margin-bottom: 32px; }
        .metric { display: inline-block; margin: 4px 8px 4px 0; padding: 4px 10px; background: #f3f0ff; border-radius: 6px; font-size: 0.85em; }
        ul { padding-left: 20px; } li { margin-bottom: 5px; }
        .disclaimer { font-size: 0.8em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 32px; }
        .priority-high { color: #dc2626; } .priority-medium { color: #d97706; } .priority-low { color: #059669; }
      </style>
    </head><body>
      <h1>${c.coverTitle || 'Monthly Trading Report'}</h1>
      <p>Trader: ${c.traderName || ''} &nbsp;|&nbsp; Period: ${c.period || ''} &nbsp;|&nbsp; ${c.dataWindowLabel ? `Data window: ${c.dataWindowLabel} · ` : ''}Generated: ${c.generatedDate || ''}</p>
      ${c.reportPhase ? `<p><strong>${c.reportPhase === 'month_open' ? 'Month opener' : 'Month close'}</strong>${c.systemUsage?.summary ? ` — ${c.systemUsage.summary}` : ''}</p>` : ''}

      ${c.brutalHonesty ? `<div class="section"><h2>Blunt read</h2><p>${c.brutalHonesty}</p></div>` : ''}
      ${(c.failureModeInventory || []).length ? `<div class="section"><h2>Failure modes</h2><ul>${(c.failureModeInventory || []).map(f => `<li>${f}</li>`).join('')}</ul></div>` : ''}
      ${c.changeVsPriorMonth ? `<div class="section"><h2>Change vs prior month</h2>
        <p><strong>Better:</strong> ${(c.changeVsPriorMonth.better || []).join('; ')}</p>
        <p><strong>Worse:</strong> ${(c.changeVsPriorMonth.worse || []).join('; ')}</p>
        <p><strong>Unchanged:</strong> ${(c.changeVsPriorMonth.unchanged || []).join('; ')}</p></div>` : ''}
      ${c.dnaHandoff ? `<div class="section"><h2>DNA vs this report</h2><p>${c.dnaHandoff}</p></div>` : ''}

      <div class="section"><h2>Executive Summary</h2>
        <p>${c.executiveSummary?.overallAssessment || ''}</p>
        <p><strong>Strongest area:</strong> ${c.executiveSummary?.strongestArea || ''}</p>
        <p><strong>Weakest area:</strong> ${c.executiveSummary?.weakestArea || ''}</p>
        <p><strong>Key focus:</strong> ${c.executiveSummary?.keyFocus || ''}</p>
      </div>

      <div class="section"><h2>Performance Summary</h2>
        <p>${c.performanceSummary?.headline || ''}</p>
        ${(c.performanceSummary?.keyMetrics || []).map(m => `<span class="metric"><strong>${m.label}:</strong> ${m.value}</span>`).join('')}
        <ul>${(c.performanceSummary?.insights || []).map(i => `<li>${i}</li>`).join('')}</ul>
      </div>

      <div class="section"><h2>Discipline Review</h2>
        <p>${c.disciplineReview?.headline || ''}</p>
        <ul>${(c.disciplineReview?.improvements || []).map(i => `<li>${i}</li>`).join('')}</ul>
      </div>

      ${c.aiChartCheckReview ? `<div class="section"><h2>AI Chart Check</h2>
        <p>${c.aiChartCheckReview.headline || ''}</p>
      </div>` : ''}

      ${c.mt5Review ? `<div class="section"><h2>MT5 Performance</h2>
        <p>${c.mt5Review.headline || ''}</p>
        <ul>${(c.mt5Review.insights || []).map(i => `<li>${i}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="section"><h2>Improvement Plan</h2>
        <ul>${(c.improvementPlan || []).map(p => `<li><span class="priority-${p.priority}">[${p.priority}]</span> <strong>${p.area}</strong>: ${p.action}${p.measurableCheck ? ` <em>Check: ${p.measurableCheck}</em>` : ''}</li>`).join('')}</ul>
      </div>

      <div class="disclaimer">${c.disclaimer || ''}</div>
    </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="rp-viewer">
      <div className="rp-viewer-toolbar">
        <div>
          <h3 className="rp-viewer-title">{c.coverTitle || 'Monthly Report'}</h3>
          <p className="rp-viewer-meta">
            {c.period} · {c.reportType?.toUpperCase()}
            {c.dataWindowLabel ? ` · Data: ${c.dataWindowLabel}` : ''} · Generated {c.generatedDate}
          </p>
          {(c.reportPhase || c.systemUsage?.summary) && (
            <p className="rp-viewer-phase">
              {c.reportPhase && (
                <span className="rp-phase-pill">{c.reportPhase === 'month_open' ? 'Month opener' : 'Month close'}</span>
              )}
              {c.systemUsage?.summary && <span className="rp-viewer-usage"> {c.systemUsage.summary}</span>}
            </p>
          )}
        </div>
        <div className="rp-viewer-actions">
          <button className="rp-btn rp-btn--secondary rp-btn--sm" onClick={handlePrint} type="button">
            🖨 Download PDF
          </button>
          <button className="rp-btn rp-btn--ghost" onClick={onClose} type="button">✕ Close</button>
        </div>
      </div>

      <div className="rp-viewer-body">
        {(c.reportPhase || c.systemUsage?.summary) && (
          <div className="rp-section rp-phase-banner">
            {c.reportPhase && (
              <span className="rp-phase-pill">{c.reportPhase === 'month_open' ? 'Month opener' : 'Month close'}</span>
            )}
            {c.systemUsage?.summary && <p className="rp-section-text rp-viewer-usage">{c.systemUsage.summary}</p>}
          </div>
        )}

        {c.brutalHonesty && (
          <div className="rp-section rp-brutal-box">
            <p className="rp-brutal-label">Blunt read</p>
            <p className="rp-brutal-text">{c.brutalHonesty}</p>
          </div>
        )}

        {c.failureModeInventory?.length > 0 && (
          <div className="rp-section">
            <h4 className="rp-section-title">Failure modes (audit every item)</h4>
            <ul className="rp-list rp-failure-list">
              {c.failureModeInventory.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {c.changeVsPriorMonth && (
          <div className="rp-section">
            <h4 className="rp-section-title">Change vs prior month</h4>
            <div className="rp-delta-grid">
              <div className="rp-delta-col">
                <h5>Better</h5>
                <ul className="rp-list">
                  {(c.changeVsPriorMonth.better || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="rp-delta-col">
                <h5>Worse</h5>
                <ul className="rp-list">
                  {(c.changeVsPriorMonth.worse || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="rp-delta-col">
                <h5>Still broken</h5>
                <ul className="rp-list">
                  {(c.changeVsPriorMonth.unchanged || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {c.dnaHandoff && (
          <div className="rp-section rp-dna-handoff">
            <p className="rp-dna-handoff-title">Trader DNA vs monthly report</p>
            <p>{c.dnaHandoff}</p>
            <p style={{ marginTop: 10 }}>
              <Link to="/reports/dna" className="rp-btn rp-btn--secondary rp-btn--sm">
                Open Trader DNA (90-day identity)
              </Link>
            </p>
          </div>
        )}

        {/* Executive Summary */}
        {c.executiveSummary && (
          <div className="rp-section">
            <h4 className="rp-section-title">Executive Summary</h4>
            <p className="rp-section-text">{c.executiveSummary.overallAssessment}</p>
            <div className="rp-summary-grid">
              <div className="rp-summary-item rp-summary-item--strength">
                <span className="rp-summary-label">Strongest Area</span>
                <span className="rp-summary-val">{c.executiveSummary.strongestArea}</span>
              </div>
              <div className="rp-summary-item rp-summary-item--weakness">
                <span className="rp-summary-label">Weakest Area</span>
                <span className="rp-summary-val">{c.executiveSummary.weakestArea}</span>
              </div>
              <div className="rp-summary-item rp-summary-item--focus">
                <span className="rp-summary-label">Key Focus</span>
                <span className="rp-summary-val">{c.executiveSummary.keyFocus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Performance */}
        {c.performanceSummary && (
          <div className="rp-section">
            <h4 className="rp-section-title">Performance Summary</h4>
            <p className="rp-section-text">{c.performanceSummary.headline}</p>
            {c.performanceSummary.keyMetrics?.length > 0 && (
              <div className="rp-metrics-row">
                {c.performanceSummary.keyMetrics.map((m, i) => (
                  <div key={i} className="rp-metric">
                    <span className="rp-metric-val">{m.value}</span>
                    <span className="rp-metric-lbl">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
            {c.performanceSummary.insights?.length > 0 && (
              <ul className="rp-list">{c.performanceSummary.insights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
            )}
          </div>
        )}

        {/* Discipline */}
        {c.disciplineReview && (
          <div className="rp-section">
            <h4 className="rp-section-title">Discipline Review</h4>
            <p className="rp-section-text">{c.disciplineReview.headline}</p>
            {c.disciplineReview.strengths?.length > 0 && (
              <>
                <p className="rp-sub-label">Strengths</p>
                <ul className="rp-list">{c.disciplineReview.strengths.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </>
            )}
            {c.disciplineReview.patterns?.length > 0 && (
              <><p className="rp-sub-label">Patterns</p>
              <ul className="rp-list">{c.disciplineReview.patterns.map((p, i) => <li key={i}>{p}</li>)}</ul></>
            )}
            {c.disciplineReview.improvements?.length > 0 && (
              <><p className="rp-sub-label">Improvements</p>
              <ul className="rp-list">{c.disciplineReview.improvements.map((p, i) => <li key={i}>{p}</li>)}</ul></>
            )}
          </div>
        )}

        {/* AI Chart Check */}
        {c.aiChartCheckReview && (
          <div className="rp-section">
            <h4 className="rp-section-title">AI Chart Check Review</h4>
            <p className="rp-section-text">{c.aiChartCheckReview.headline}</p>
            {c.aiChartCheckReview.avgAlignment !== 'N/A' && (
              <p className="rp-section-text">Average alignment: <strong>{c.aiChartCheckReview.avgAlignment}</strong></p>
            )}
          </div>
        )}

        {/* MT5 */}
        {c.mt5Review && (
          <div className="rp-section">
            <h4 className="rp-section-title">MT5 Performance</h4>
            <p className="rp-section-text">{c.mt5Review.headline}</p>
            {c.mt5Review.insights?.length > 0 && (
              <ul className="rp-list">{c.mt5Review.insights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
            )}
          </div>
        )}

        {/* Improvement Plan */}
        {c.improvementPlan?.length > 0 && (
          <div className="rp-section">
            <h4 className="rp-section-title">Improvement Plan</h4>
            <div className="rp-plan-list">
              {c.improvementPlan.map((p, i) => (
                <div key={i} className={`rp-plan-item rp-plan-item--${p.priority}`}>
                  <div className="rp-plan-header">
                    <span className="rp-plan-area">{p.area}</span>
                    <span className={`rp-plan-priority rp-plan-priority--${p.priority}`}>{p.priority}</span>
                  </div>
                  <p className="rp-plan-action">{p.action}</p>
                  {p.measurableCheck && (
                    <p className="rp-plan-measurable">
                      <strong>Measurable check:</strong> {p.measurableCheck}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {c.disclaimer && <p className="rp-disclaimer">{c.disclaimer}</p>}
      </div>
    </div>
  );
}

/* ── Report history list ─────────────────────────────────────────────── */
function ReportHistoryList({ reports, onView }) {
  if (!reports?.length) {
    return (
      <div className="rp-empty-card">
        <p className="rp-empty">No reports generated yet. Generate your first monthly report above.</p>
      </div>
    );
  }
  return (
    <div className="rp-history">
      <h4 className="rp-history-title">Report History</h4>
      <div className="rp-history-list">
        {reports.map(r => (
          <div key={r.id} className={`rp-history-item rp-history-item--${r.status}`}>
            <div className="rp-history-left">
              <span className="rp-history-period">
                {MONTH_NAMES[r.period_month - 1]} {r.period_year}
                <span className="rp-history-phase"> · {reportPhaseLabel(r.report_phase)}</span>
              </span>
              <span className={`rp-history-status rp-history-status--${r.status}`}>
                {r.status === 'ready' ? '✓ Ready' : r.status === 'generating' ? '⟳ Generating…' : '✗ Failed'}
              </span>
            </div>
            <div className="rp-history-right">
              {r.status === 'ready' && (
                <button className="rp-btn rp-btn--secondary rp-btn--sm" onClick={() => onView(r.id)} type="button">
                  View Report
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
function ReportsPageInner() {
  const { token } = useAuth();
  const { eligibility, loading, error, reload } = useReportsEligibility(token);
  const [viewingReport, setViewingReport] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const handleViewReport = async (id) => {
    setViewLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/reports/history?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setViewingReport(data.report);
    } catch {}
    setViewLoading(false);
  };

  if (loading) {
    return (
      <div className="rp-loading journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <span className="rp-spinner" />
        <span>Loading reports…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-error-state journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <p>{error}</p>
        <button className="rp-btn rp-btn--secondary" onClick={reload} type="button">Retry</button>
      </div>
    );
  }

  if (!eligibility) return null;

  const { role } = eligibility;

  const { currentPeriod, currentMonthReports, reports, isEligible } = eligibility;
  const { year, month } = currentPeriod;
  const openRow = currentMonthReports?.month_open;
  const closeRow = currentMonthReports?.month_close;

  if (viewingReport) {
    return (
      <div className="rp-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
        <ReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />
      </div>
    );
  }

  return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
      <div className="rp-header">
        <div className="rp-header-stack">
          <p className="rp-eyebrow">Performance intelligence</p>
          <h2 className="rp-title">Performance &amp; DNA</h2>
          <Link to="/reports/dna" className="rp-btn rp-btn--secondary rp-dna-enter">
            Enter Your DNA
          </Link>
          <p className="rp-subtitle">
            {role === 'premium' || role === 'pro'
              ? 'Monthly blunt coaching: journal + The Operator (when logged) + optional MT5 CSV. Explicit failure modes, change vs last month, and measurable checks. Trader DNA (/reports/dna) is your 90-day identity mirror — this is your fix list.'
              : 'Elite: same harsh standard with trades from The Operator in the month plus platform data. DNA shows who you are every ~90 days; this report shows what to change next.'}
          </p>
        </div>
        <span className={`rp-role-badge rp-role-badge--${role}`}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </span>
      </div>

      <ReportsHubSubNav role={role} year={year} month={month} />

      {/* Eligibility */}
      <EligibilityBar eligibility={eligibility} />

      {isEligible && (
        <div className="rp-current-period">
          <div className="rp-current-period-header">
            <h3 className="rp-current-title">
              {MONTH_NAMES[month - 1]} {year} — monthly reports
            </h3>
            {(openRow?.status === 'ready' || closeRow?.status === 'ready') && (
              <span className="rp-badge rp-badge--ready">✓ Ready</span>
            )}
          </div>

          {/* CSV/manual metrics entry is now centered in Aura Analysis → Connection Hub */}
          {(role === 'premium' || role === 'pro') && (
            <div className="rp-auto-notice">
              <span className="rp-auto-icon">📄</span>
              <p>
                CSV upload moved to <strong>Aura Analysis → Connection Hub</strong>. Use <strong>Connect with CSV</strong> there,
                then open the CSV dashboard for this period.
              </p>
            </div>
          )}

          {/* Elite/Admin automation notice */}
          {['elite', 'admin'].includes(role) && (
            <div className="rp-auto-notice">
              <span className="rp-auto-icon">⚡</span>
              <p>Your report is automatically compiled from all available platform data — no uploads needed.</p>
            </div>
          )}

          <div className="rp-current-split">
            <div className="rp-report-ready rp-report-ready--phase">
              <div className="rp-report-ready-main">
                <span className="rp-phase-pill">Month opener</span>
                <p className="rp-report-ready-hint">
                  Targets the <strong>1st</strong> (last month’s data): priorities and what to fix this month. If you become eligible mid-month, it appears once generation succeeds.
                </p>
              </div>
              {openRow?.status === 'ready' ? (
                <>
                  <p className="rp-report-ready-title">Ready · {new Date(openRow.generated_at).toLocaleDateString()}</p>
                  <button
                    className="rp-btn rp-btn--primary rp-btn--sm"
                    onClick={() => handleViewReport(openRow.id)}
                    disabled={viewLoading}
                    type="button"
                  >
                    {viewLoading ? 'Loading…' : 'View opener'}
                  </button>
                </>
              ) : (
                <p className="rp-report-pending">Not ready yet — usually from the 1st, or after you meet data requirements.</p>
              )}
            </div>

            <div className="rp-report-ready rp-report-ready--phase">
              <div className="rp-report-ready-main">
                <span className="rp-phase-pill rp-phase-pill--close">Month close</span>
                <p className="rp-report-ready-hint">
                  Drops on the <strong>last day</strong>: full review of this month vs your opener — improvement, stall, or drift.
                </p>
              </div>
              {closeRow?.status === 'ready' ? (
                <>
                  <p className="rp-report-ready-title">Ready · {new Date(closeRow.generated_at).toLocaleDateString()}</p>
                  <button
                    className="rp-btn rp-btn--primary rp-btn--sm"
                    onClick={() => handleViewReport(closeRow.id)}
                    disabled={viewLoading}
                    type="button"
                  >
                    {viewLoading ? 'Loading…' : 'View close'}
                  </button>
                </>
              ) : (
                <p className="rp-report-pending">Not generated yet (runs on the last calendar day).</p>
              )}
            </div>
          </div>

          {!openRow && !closeRow && (
            <div className="rp-auto-notice">
              <span className="rp-auto-icon">🧾</span>
              <p>
                You have two statements each calendar month once you have enough data. We start from your first active month and keep everything in history.
              </p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <ReportHistoryList
        reports={reports}
        onView={handleViewReport}
      />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AuraTerminalThemeShell>
      <ReportsPageInner />
    </AuraTerminalThemeShell>
  );
}
