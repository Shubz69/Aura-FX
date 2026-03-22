/**
 * ReportsPage — role-aware monthly AI report hub.
 * Free   → locked / upsell
 * Premium → eligibility + CSV upload flow + report list
 * Elite  → automated dashboard + report list
 * Admin  → same as elite
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuraTerminalThemeShell from '../../components/AuraTerminalThemeShell';
import '../../styles/reports/ReportsPage.css';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function useReportsData(token) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/reports/eligibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setEligibility(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  return { eligibility, loading, error, reload: load };
}

/* ── Locked view for free users ────────────────────────────────────── */
function FreeLockedView() {
  return (
    <div className="rp-locked">
      <div className="rp-locked-icon">📊</div>
      <p className="rp-eyebrow rp-eyebrow--center">Premium feature</p>
      <h2 className="rp-locked-title">Monthly Reports</h2>
      <Link to="/reports/dna" className="rp-btn rp-btn--secondary rp-dna-enter">
        Enter Your DNA
      </Link>
      <p className="rp-locked-sub">
        Get a professionally generated monthly performance report — covering your trades,
        discipline, checklist quality, AI chart check history, and a personalised improvement plan.
      </p>
      <div className="rp-locked-cards">
        <div className="rp-locked-card rp-locked-card--premium">
          <div className="rp-locked-card-badge">Premium</div>
          <h4>Platform Report</h4>
          <ul>
            <li>Full platform data analysis</li>
            <li>Trade performance breakdown</li>
            <li>Discipline & journal review</li>
            <li>MT5 sections via CSV upload</li>
            <li>Downloadable PDF</li>
          </ul>
        </div>
        <div className="rp-locked-card rp-locked-card--elite">
          <div className="rp-locked-card-badge">Elite</div>
          <h4>Automated Full Report</h4>
          <ul>
            <li>Everything in Premium</li>
            <li>Fully automated — no CSV needed</li>
            <li>MT5 data pulled automatically</li>
            <li>AI deep-dive on execution quality</li>
            <li>Priority generation</li>
          </ul>
        </div>
      </div>
      <a className="rp-btn rp-btn--primary" href="/choose-plan">Upgrade to Premium or Elite →</a>
    </div>
  );
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
            You currently have <strong>{dataDays} days</strong>.
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

/* ── CSV Upload (Premium only) ──────────────────────────────────────── */
function CsvUploadSection({ token, year, month, csvStatus, onUploaded }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file exported from MT5.');
      return;
    }
    if (file.size > 5_000_000) { setError('File too large (max 5MB).'); return; }
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => setCsv(e.target.result);
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!csv) return;
    setUploading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/reports/csv-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv, year, month }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setUploadResult(data.summary);
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await fetch(`${BASE_URL}/api/reports/csv-upload`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, month }),
      });
      setCsv(''); setFileName(''); setUploadResult(null);
      onUploaded?.();
    } catch {}
  };

  if (csvStatus) {
    return (
      <div className="rp-csv-done">
        <span className="rp-csv-done-icon">✓</span>
        <div>
          <p className="rp-csv-done-title">MT5 CSV uploaded — {csvStatus.trade_count} trades</p>
          <p className="rp-csv-done-hint">Your MT5 data will be included in the report.</p>
        </div>
        <button className="rp-btn rp-btn--ghost" onClick={handleRemove} type="button">Remove</button>
      </div>
    );
  }

  return (
    <div className="rp-csv-section">
      <h4 className="rp-csv-title">MT5 Performance Data <span className="rp-badge rp-badge--optional">Optional</span></h4>
      <p className="rp-csv-hint">
        Upload your MT5 trade history CSV to include MT5 performance sections in your report.
        Export from MT5: History → All History → Save as Report (CSV).
      </p>

      {!csv ? (
        <div
          className="rp-csv-drop"
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
          onDragOver={e => e.preventDefault()}
          role="button" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        >
          <span className="rp-csv-drop-icon">📁</span>
          <span>Drop your MT5 CSV here or <u>browse</u></span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </div>
      ) : (
        <div className="rp-csv-ready">
          <span className="rp-csv-file-name">📄 {fileName}</span>
          {uploadResult ? (
            <div className="rp-csv-parsed">
              <span>✓ {uploadResult.tradeCount} trades · Win rate {uploadResult.winRate}% · P&L {uploadResult.totalPnl}</span>
            </div>
          ) : (
            <button className="rp-btn rp-btn--primary rp-btn--sm" onClick={handleSubmit} disabled={uploading} type="button">
              {uploading ? 'Uploading…' : 'Upload & Parse'}
            </button>
          )}
          <button className="rp-btn rp-btn--ghost" onClick={() => { setCsv(''); setFileName(''); setUploadResult(null); }} type="button">✕</button>
        </div>
      )}
      {error && <p className="rp-field-error">{error}</p>}
    </div>
  );
}

/* ── Generate button + status ───────────────────────────────────────── */
function GenerateSection({ token, year, month, existingReport, onGenerated, role }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ year, month }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      onGenerated?.(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (existingReport?.status === 'ready') return null;

  return (
    <div className="rp-generate-section">
      {error && <div className="rp-error-box">{error}</div>}
      <button
        className="rp-btn rp-btn--primary"
        onClick={handleGenerate}
        disabled={generating}
        type="button"
      >
        {generating ? (
          <><span className="rp-spinner" /> Generating report… (30–60s)</>
        ) : (
          <>✦ Generate {MONTH_NAMES[month - 1]} {year} Report</>
        )}
      </button>
      {generating && (
        <p className="rp-generating-hint">
          AI is collating your {role === 'premium' ? 'platform' : 'full'} data and writing your report.
          This usually takes 30–60 seconds.
        </p>
      )}
    </div>
  );
}

/* ── Report viewer ──────────────────────────────────────────────────── */
function ReportViewer({ report, onClose }) {
  const c = report.content || {};

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
      <p>Trader: ${c.traderName || ''} &nbsp;|&nbsp; Period: ${c.period || ''} &nbsp;|&nbsp; Generated: ${c.generatedDate || ''}</p>

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
        <ul>${(c.improvementPlan || []).map(p => `<li><span class="priority-${p.priority}">[${p.priority}]</span> <strong>${p.area}</strong>: ${p.action}</li>`).join('')}</ul>
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
          <p className="rp-viewer-meta">{c.period} · {c.reportType?.toUpperCase()} · Generated {c.generatedDate}</p>
        </div>
        <div className="rp-viewer-actions">
          <button className="rp-btn rp-btn--secondary rp-btn--sm" onClick={handlePrint} type="button">
            🖨 Download PDF
          </button>
          <button className="rp-btn rp-btn--ghost" onClick={onClose} type="button">✕ Close</button>
        </div>
      </div>

      <div className="rp-viewer-body">
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
function ReportHistoryList({ token, reports, onView }) {
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
              <span className="rp-history-period">{MONTH_NAMES[r.period_month - 1]} {r.period_year}</span>
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
  const { eligibility, loading, error, reload } = useReportsData(token);
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
      <div className="rp-loading journal-glass-panel journal-glass-panel--pad">
        <span className="rp-spinner" />
        <span>Loading reports…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-error-state journal-glass-panel journal-glass-panel--pad">
        <p>{error}</p>
        <button className="rp-btn rp-btn--secondary" onClick={reload} type="button">Retry</button>
      </div>
    );
  }

  if (!eligibility) return null;

  const { role } = eligibility;

  // Free users
  if (role === 'free') return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad">
      <FreeLockedView />
    </div>
  );

  const { currentPeriod, currentMonthReport, csvStatus, reports, isEligible } = eligibility;
  const { year, month } = currentPeriod;

  if (viewingReport) {
    return (
      <div className="rp-page journal-glass-panel journal-glass-panel--pad">
        <ReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />
      </div>
    );
  }

  return (
    <div className="rp-page journal-glass-panel journal-glass-panel--pad">
      <div className="rp-header">
        <div className="rp-header-stack">
          <p className="rp-eyebrow">Performance intelligence</p>
          <h2 className="rp-title">Monthly Reports</h2>
          <Link to="/reports/dna" className="rp-btn rp-btn--secondary rp-dna-enter">
            Enter Your DNA
          </Link>
          <p className="rp-subtitle">
            {role === 'premium'
              ? 'Your monthly performance report — powered by your platform data and optional MT5 CSV.'
              : 'Your fully automated monthly performance report — AI-generated from all your platform data.'}
          </p>
        </div>
        <span className={`rp-role-badge rp-role-badge--${role}`}>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </span>
      </div>

      {/* Eligibility */}
      <EligibilityBar eligibility={eligibility} />

      {isEligible && (
        <div className="rp-current-period">
          <div className="rp-current-period-header">
            <h3 className="rp-current-title">
              {MONTH_NAMES[month - 1]} {year} Report
            </h3>
            {currentMonthReport?.status === 'ready' && (
              <span className="rp-badge rp-badge--ready">✓ Ready</span>
            )}
          </div>

          {/* Premium CSV upload */}
          {role === 'premium' && (
            <CsvUploadSection
              token={token}
              year={year}
              month={month}
              csvStatus={csvStatus}
              onUploaded={reload}
            />
          )}

          {/* Elite/Admin automation notice */}
          {['elite', 'admin'].includes(role) && (
            <div className="rp-auto-notice">
              <span className="rp-auto-icon">⚡</span>
              <p>Your report is automatically compiled from all available platform data — no uploads needed.</p>
            </div>
          )}

          {currentMonthReport?.status === 'ready' ? (
            <div className="rp-report-ready">
              <span className="rp-report-ready-icon">✓</span>
              <div>
                <p className="rp-report-ready-title">{MONTH_NAMES[month - 1]} {year} report is ready</p>
                <p className="rp-report-ready-hint">Generated {new Date(currentMonthReport.generated_at).toLocaleDateString()}</p>
              </div>
              <button
                className="rp-btn rp-btn--primary rp-btn--sm"
                onClick={() => handleViewReport(currentMonthReport.id)}
                disabled={viewLoading}
                type="button"
              >
                {viewLoading ? 'Loading…' : 'View Report'}
              </button>
            </div>
          ) : (
            <GenerateSection
              token={token}
              year={year}
              month={month}
              existingReport={currentMonthReport}
              role={role}
              onGenerated={(report) => {
                reload();
              }}
            />
          )}
        </div>
      )}

      {/* History */}
      <ReportHistoryList
        token={token}
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
