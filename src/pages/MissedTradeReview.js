import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
import { normalizeSetup } from '../lib/trader-playbook/normalizeSetup';
import { summarizeMissedPatterns } from '../lib/trader-playbook/analyticsClient';
import { MID } from '../lib/trader-playbook/metricDefinitions';
import { MetricLabel } from '../lib/trader-playbook/MetricTooltip';
import { NO_SETUP_REASONS } from '../lib/trader-playbook/rulesCopy';
import { OPERATOR_BASE as TV_BASE, PLAYBOOK_HUB_PATH } from '../lib/trader-playbook/playbookPaths';
import '../styles/TraderPlaybookTerminalTokens.css';
import '../styles/aura-analysis/AuraDashboard.css';
import '../styles/TraderPlaybookPremium.css';
import '../styles/MissedTradeReview.css';

function clipText(s, max = 200) {
  if (!s || !String(s).trim()) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function fmtShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function bulletLines(raw, max = 5) {
  if (!raw || !String(raw).trim()) return [];
  const t = String(raw).replace(/\r\n/g, '\n').trim();
  const parts = t
    .split(/\n+/)
    .map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim())
    .filter(Boolean);
  return (parts.length > 1 ? parts : t.split(/;+/).map((x) => x.trim()).filter(Boolean)).slice(0, max);
}

function noSetupLabel(value) {
  return NO_SETUP_REASONS.find((r) => r.value === value)?.label || value || '—';
}

function missTypeLabel(t) {
  const x = String(t || '').toLowerCase();
  if (x === 'mis_execute') return 'Mis-executed';
  if (x === 'early') return 'Too early';
  if (x === 'late') return 'Too late';
  if (x === 'missed') return 'Missed';
  return t || '—';
}

function missingComponentLabel(m) {
  const t = String(m?.missType || '').toLowerCase();
  if (t === 'late' || t === 'early') return 'Timing / trigger';
  if (t === 'mis_execute') return 'Execution fidelity';
  if (t === 'missed') return 'Participation / plan';
  return 'Review context';
}

function hesitationRow(m) {
  const t = String(m?.missType || '').toLowerCase();
  if (t === 'late' || t === 'early') return true;
  const blob = `${m?.missReason || ''} ${m?.qualificationReason || ''}`.toLowerCase();
  return /hesitat|hesitate|fear|doubt|waited|second[\s-]?guess|froze|chicken/.test(blob);
}

export default function MissedTradeReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [setups, setSetups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [mTrades, setMTrades] = useState([]);
  const [vTrades, setVTrades] = useState([]);
  const [jTrades, setJTrades] = useState([]);
  const [mainTab, setMainTab] = useState('missed');
  const [sortDesc, setSortDesc] = useState(true);
  const [playbookFilter, setPlaybookFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedMId, setSelectedMId] = useState(null);
  const [selectedOffKey, setSelectedOffKey] = useState(null);
  const [reviewNotes, setReviewNotes] = useState([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const playbookById = useMemo(() => {
    const m = {};
    (setups || []).forEach((s) => {
      if (s?.id) m[s.id] = s.name || 'Playbook';
    });
    return m;
  }, [setups]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const settled = await Promise.allSettled([
        Api.getTraderPlaybookSetups(),
        Api.getTraderPlaybookSummary(),
        Api.getTraderPlaybookMTrades({}),
        Api.getAuraAnalysisTrades({}),
        Api.getJournalTrades({}),
      ]);
      const [sr, sumr, mr, vr, jr] = settled;
      if (sr.status === 'fulfilled' && sr.value?.data?.setups) {
        setSetups(sr.value.data.setups.map((s) => normalizeSetup(s)));
      } else setSetups([]);
      if (sumr.status === 'fulfilled' && sumr.value?.data?.summary) setSummary(sumr.value.data.summary);
      else setSummary(null);
      if (mr.status === 'fulfilled' && Array.isArray(mr.value?.data?.mTrades)) setMTrades(mr.value.data.mTrades);
      else setMTrades([]);
      if (vr.status === 'fulfilled' && Array.isArray(vr.value?.data?.trades)) setVTrades(vr.value.data.trades);
      else setVTrades([]);
      if (jr.status === 'fulfilled' && Array.isArray(jr.value?.data?.trades)) setJTrades(jr.value.data.trades);
      else setJTrades([]);
    } catch {
      toast.error('Could not load missed review data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const offPlanRows = useMemo(() => {
    const out = [];
    (vTrades || []).forEach((t) => {
      if (String(t.setupTagType || '').toUpperCase() === 'NO_SETUP') {
        out.push({
          key: `v-${t.id}`,
          source: 'validator',
          id: t.id,
          label: `${t.pair || '—'} · ${t.direction || ''}`,
          at: t.createdAt,
          reason: t.noSetupReason || null,
        });
      }
    });
    (jTrades || []).forEach((t) => {
      if (String(t.setupTagType || '').toUpperCase() === 'NO_SETUP') {
        out.push({
          key: `j-${t.id}`,
          source: 'journal',
          id: t.id,
          label: `${t.pair || '—'} · ${t.date || ''}`,
          at: t.date,
          reason: t.noSetupReason || null,
        });
      }
    });
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [vTrades, jTrades]);

  const mFiltered = useMemo(() => {
    let rows = [...(mTrades || [])];
    if (mainTab === 'hesitation') rows = rows.filter(hesitationRow);
    if (playbookFilter) rows = rows.filter((m) => m.playbookId === playbookFilter);
    rows.sort((a, b) => {
      const cmp = String(b.occurredAt || b.createdAt || '').localeCompare(String(a.occurredAt || a.createdAt || ''));
      return sortDesc ? cmp : -cmp;
    });
    return rows;
  }, [mTrades, mainTab, playbookFilter, sortDesc]);

  const mPatterns = useMemo(() => summarizeMissedPatterns(mTrades, null), [mTrades]);
  const distinctMissTypes = useMemo(() => {
    const s = new Set((mTrades || []).map((m) => (m.missType || '').trim()).filter(Boolean));
    return s.size;
  }, [mTrades]);

  const missRatePct = useMemo(() => {
    const tagged = summary?.taggedTrades ?? 0;
    const missed = summary?.missedTrades ?? 0;
    const den = tagged + missed;
    if (!den) return null;
    return missed / den;
  }, [summary]);

  const selectedM = useMemo(() => mFiltered.find((m) => m.id === selectedMId) || null, [mFiltered, selectedMId]);
  const selectedOff = useMemo(
    () => offPlanRows.find((r) => r.key === selectedOffKey) || null,
    [offPlanRows, selectedOffKey]
  );

  useEffect(() => {
    if (!selectedM?.playbookId) {
      setReviewNotes([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await Api.getTraderPlaybookReviewNotes(selectedM.playbookId);
        if (!cancelled && Array.isArray(res?.data?.notes)) setReviewNotes(res.data.notes);
        else if (!cancelled) setReviewNotes([]);
      } catch {
        if (!cancelled) setReviewNotes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedM?.playbookId]);

  useEffect(() => {
    if (mainTab === 'offplan') {
      setSelectedMId(null);
      setSelectedOffKey((prev) => (prev && offPlanRows.some((r) => r.key === prev) ? prev : offPlanRows[0]?.key ?? null));
    } else {
      setSelectedOffKey(null);
      setSelectedMId((prev) => (prev && mFiltered.some((m) => m.id === prev) ? prev : mFiltered[0]?.id ?? null));
    }
  }, [mainTab, mFiltered, offPlanRows]);

  const improvementBullets = useMemo(() => {
    if (!selectedM) return [];
    return [
      ...bulletLines(selectedM.lessonLearned, 3),
      ...bulletLines(selectedM.whatShouldHaveHappened, 2),
    ].slice(0, 4);
  }, [selectedM]);

  const similarCount = useMemo(() => {
    if (!selectedM?.missType) return 0;
    return (mTrades || []).filter((m) => m.missType === selectedM.missType).length;
  }, [mTrades, selectedM]);

  const reviewNext = () => {
    if (mainTab === 'offplan') {
      if (!offPlanRows.length) {
        toast.info('No off-plan rows in the loaded sample.');
        return;
      }
      const idx = Math.max(
        0,
        offPlanRows.findIndex((r) => r.key === selectedOffKey)
      );
      const next = offPlanRows[(idx + 1) % offPlanRows.length];
      setSelectedOffKey(next.key);
      return;
    }
    if (!mFiltered.length) {
      toast.info('No missed rows in this view.');
      return;
    }
    const idx = Math.max(0, mFiltered.findIndex((m) => m.id === selectedMId));
    const next = mFiltered[(idx + 1) % mFiltered.length];
    setSelectedMId(next.id);
  };

  const submitNote = async () => {
    if (!selectedM?.playbookId) {
      toast.info('Link this miss to a playbook to attach refinement notes.');
      return;
    }
    if (!noteTitle.trim() && !noteBody.trim()) {
      toast.info('Add a title or body for the note.');
      return;
    }
    try {
      await Api.createTraderPlaybookReviewNote({
        playbookId: selectedM.playbookId,
        noteType: 'lesson',
        title: noteTitle.trim() || 'Missed trade review',
        body: noteBody.trim(),
        periodLabel: '',
      });
      toast.success('Note saved');
      setNoteTitle('');
      setNoteBody('');
      const res = await Api.getTraderPlaybookReviewNotes(selectedM.playbookId);
      if (Array.isArray(res?.data?.notes)) setReviewNotes(res.data.notes);
    } catch {
      toast.error('Could not save note');
    }
  };

  const sortedNotes = useMemo(
    () => [...(reviewNotes || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    [reviewNotes]
  );

  const listCount = mainTab === 'offplan' ? offPlanRows.length : mFiltered.length;

  const primaryHeadline = selectedM
    ? clipText(selectedM.missReason || selectedM.setupSummary || 'Missed setup — review the log fields.', 160)
    : selectedOff
      ? `Off-plan: ${noSetupLabel(selectedOff.reason)}`
      : 'Select a row to review';

  const statsStrip = !loading && (
    <div className="mtr-stats-strip" aria-label="Missed review summary">
      <div className="mtr-stat-chip">
        <span className="mtr-stat-chip__k">
          <MetricLabel metricId={MID.MISSED_LOG}>Missed setups (log)</MetricLabel>
        </span>
        <span className="mtr-stat-chip__v">{summary?.missedTrades ?? mTrades.length}</span>
      </div>
      <div className="mtr-stat-chip">
        <span className="mtr-stat-chip__k">
          <MetricLabel metricId={MID.OFF_PLAN_RATE_CLASSIFIED}>Classified off-plan rate</MetricLabel>
        </span>
        <span className="mtr-stat-chip__v">{summary?.noSetupRate != null ? `${Math.round(summary.noSetupRate * 100)}%` : '—'}</span>
      </div>
      <div className="mtr-stat-chip">
        <span className="mtr-stat-chip__k">Miss / on-book ratio</span>
        <span className="mtr-stat-chip__v">{missRatePct != null ? `${Math.round(missRatePct * 100)}%` : '—'}</span>
      </div>
      <div className="mtr-stat-chip">
        <span className="mtr-stat-chip__k">Distinct miss types</span>
        <span className="mtr-stat-chip__v">{distinctMissTypes || '—'}</span>
      </div>
      <div className="mtr-stat-chip">
        <span className="mtr-stat-chip__k">Foregone P&amp;L</span>
        <span className="mtr-stat-chip__v mtr-stat-chip__v--muted">Not stored on miss rows</span>
      </div>
    </div>
  );

  const chartBlock = () => {
    if (mainTab === 'offplan' && selectedOff) {
      return (
        <div className="tp-panel mtr-chart-panel">
          <span className="mtr-kicker">Trade context</span>
          <div className="mtr-chart-placeholder">
            <strong>Off-plan execution</strong>
            <span>{selectedOff.label}</span>
            <span>{fmtShortDate(selectedOff.at)}</span>
          </div>
        </div>
      );
    }
    if (!selectedM) {
      return (
        <div className="tp-panel mtr-chart-panel">
          <span className="mtr-kicker">Trade context</span>
          <div className="mtr-chart-placeholder">
            <strong>No selection</strong>
            <span>Choose a miss from the list to load context.</span>
          </div>
        </div>
      );
    }
    const url = selectedM.screenshotUrl && /^https?:\/\//i.test(String(selectedM.screenshotUrl).trim());
    return (
      <div className="tp-panel mtr-chart-panel">
        <span className="mtr-kicker">Chart / screenshot</span>
        {url ? (
          <img className="mtr-chart-img" src={selectedM.screenshotUrl.trim()} alt="" />
        ) : (
          <div className="mtr-chart-placeholder">
            <strong>{selectedM.asset || 'Instrument'}</strong>
            <span>
              {selectedM.timeframe ? `${selectedM.timeframe} · ` : ''}
              {selectedM.session || 'Session not set'}
            </span>
            <span>Add a screenshot URL when logging misses to anchor the review visually.</span>
          </div>
        )}
        <div className="mtr-summary-strip">
          <span>
            <strong>{playbookById[selectedM.playbookId] || 'Unlinked'}</strong>
          </span>
          <span>· {fmtShortDate(selectedM.occurredAt || selectedM.createdAt)}</span>
          <span>· {missTypeLabel(selectedM.missType)}</span>
        </div>
      </div>
    );
  };

  const centerAnalysis = () => {
    if (mainTab === 'offplan' && selectedOff) {
      return (
        <>
          <section className="tp-panel mtr-diag-shell mtr-diag-shell--offplan" aria-labelledby="mtr-diag-off">
            <span className="mtr-kicker" id="mtr-diag-off">
              Off-plan review
            </span>
            <h2 className="mtr-diag-title">{primaryHeadline}</h2>
            <dl className="mtr-diag-grid">
              <div className="mtr-diag-row">
                <dt>Execution</dt>
                <dd>{selectedOff.label}</dd>
              </div>
              <div className="mtr-diag-row">
                <dt>Classifier</dt>
                <dd>{selectedOff.source === 'validator' ? 'Operator' : 'Journal'}</dd>
              </div>
              <div className="mtr-diag-row">
                <dt>Driver</dt>
                <dd>{noSetupLabel(selectedOff.reason)}</dd>
              </div>
            </dl>
            <p className="tp-detail-glance-empty" style={{ marginTop: 8 }}>
              Re-tag to the correct playbook from Classify trades, or keep as honest off-plan process data.
            </p>
            <button type="button" className="trader-suite-btn" style={{ marginTop: 10 }} onClick={() => navigate(PLAYBOOK_HUB_PATH)}>
              Open playbook workspace
            </button>
          </section>
        </>
      );
    }
    if (!selectedM) {
      return (
        <section className="tp-panel">
          <p className="mtr-empty">Select a missed setup to see diagnosis, patterns, and improvements.</p>
        </section>
      );
    }
    const chips = [missTypeLabel(selectedM.missType), selectedM.session, selectedM.asset].filter(Boolean);
    return (
      <>
        <section className="tp-panel mtr-diag-shell" aria-labelledby="mtr-reason-title">
          <span className="mtr-kicker">Reason missed</span>
          <h2 className="mtr-diag-title" id="mtr-reason-title">
            {primaryHeadline}
          </h2>
          <dl className="mtr-diag-grid">
            <div className="mtr-diag-row">
              <dt>Missed pattern</dt>
              <dd>{missTypeLabel(selectedM.missType)}</dd>
            </div>
            <div className="mtr-diag-row">
              <dt>Process signal</dt>
              <dd>{clipText(selectedM.qualificationReason || selectedM.missReason || '—', 220)}</dd>
            </div>
            <div className="mtr-diag-row">
              <dt>Missing component</dt>
              <dd>{missingComponentLabel(selectedM)}</dd>
            </div>
          </dl>
          {selectedM.setupSummary ? (
            <p className="tp-detail-expanded-notes__body" style={{ marginTop: 4 }}>
              {clipText(selectedM.setupSummary, 400)}
            </p>
          ) : null}
        </section>

        <section className="tp-panel mtr-panel-tight" aria-label="Pattern recognition">
          <span className="mtr-kicker">Pattern recognition</span>
          <div className="mtr-chip-row" style={{ marginTop: 8 }}>
            {chips.map((c) => (
              <span key={c} className="mtr-chip">
                {c}
              </span>
            ))}
            {mPatterns.topMissTypes?.[0]?.[0] ? (
              <span className="mtr-chip mtr-chip--neutral">Top log tag: {mPatterns.topMissTypes[0][0]}</span>
            ) : null}
          </div>
          {selectedM.severity != null ? (
            <div className="mtr-severity" style={{ marginTop: 10 }} aria-label={`Severity ${selectedM.severity} of 5`}>
              <span>Severity</span>
              <span>{'●'.repeat(Math.min(5, Math.max(1, selectedM.severity)))}</span>
              <span style={{ color: 'rgba(200,196,232,0.5)' }}>{'○'.repeat(Math.max(0, 5 - Math.min(5, Math.max(1, selectedM.severity))))}</span>
            </div>
          ) : null}
        </section>

        <section className="tp-panel mtr-panel-tight" aria-label="Improvement steps">
          <span className="mtr-kicker">Improvement steps</span>
          {improvementBullets.length ? (
            <ul className="mtr-improve-list" style={{ marginTop: 8 }}>
              {improvementBullets.map((line, i) => (
                <li key={`imp-${i}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="tp-detail-glance-empty" style={{ marginTop: 8 }}>
              Add lesson or corrective text on the miss log so future reviews stay actionable.
            </p>
          )}
        </section>

        <section className="tp-panel mtr-panel-tight" aria-label="Add refinement note">
          <span className="mtr-kicker">Add note</span>
          <div className="mtr-note-form" style={{ marginTop: 8 }}>
            <input className="tp-input" placeholder="Headline" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            <textarea className="tp-textarea" placeholder="What will you change next session?" rows={3} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={submitNote}>
              Save refinement note
            </button>
            {!selectedM.playbookId ? (
              <p className="tp-detail-glance-empty">Link this miss to a playbook to attach notes to that book.</p>
            ) : null}
          </div>
        </section>
      </>
    );
  };

  const rightColumn = () => {
    if (mainTab === 'offplan' && selectedOff) {
      return (
        <>
          <section className="tp-panel">
            <span className="mtr-kicker">Stats</span>
            <dl className="mtr-diag-grid" style={{ marginTop: 8 }}>
              <div className="mtr-diag-row">
                <dt>Off-plan in sample</dt>
                <dd>{offPlanRows.length}</dd>
              </div>
              <div className="mtr-diag-row">
                <dt>Driver</dt>
                <dd>{noSetupLabel(selectedOff.reason)}</dd>
              </div>
            </dl>
          </section>
          <section className="tp-panel">
            <span className="mtr-kicker">Refinement notes</span>
            <p className="tp-detail-glance-empty" style={{ marginTop: 8 }}>
              Notes are scoped to playbooks. Open a playbook miss to see its timeline.
            </p>
          </section>
        </>
      );
    }
    if (!selectedM) {
      return (
        <section className="tp-panel">
          <span className="mtr-kicker">Stats</span>
          <p className="mtr-empty">Select a miss for side stats.</p>
        </section>
      );
    }
    return (
      <>
        <section className="tp-panel">
          <span className="mtr-kicker">Stats</span>
          <dl className="mtr-diag-grid" style={{ marginTop: 8 }}>
            <div className="mtr-diag-row">
              <dt>Same pattern</dt>
              <dd>{similarCount} rows</dd>
            </div>
            <div className="mtr-diag-row">
              <dt>Miss / on-book</dt>
              <dd>{missRatePct != null ? `${Math.round(missRatePct * 100)}%` : '—'}</dd>
            </div>
            <div className="mtr-diag-row">
              <dt>Tagged pattern</dt>
              <dd>{missTypeLabel(selectedM.missType)}</dd>
            </div>
            <div className="mtr-diag-row">
              <dt>Foregone P&amp;L</dt>
              <dd className="mtr-stat-chip__v--muted">Not in schema</dd>
            </div>
          </dl>
        </section>
        <section className="tp-panel mtr-panel-tight" aria-label="Next moves">
          <span className="mtr-kicker">Next moves</span>
          <p className="mtr-next-moves-lead">
            {improvementBullets.length
              ? 'Centre column lists your captured lessons — use these actions to close the loop in the live workspace.'
              : 'Add lesson text on the miss log so this column can mirror concrete fixes; meanwhile, jump to classification or the journal.'}
          </p>
          <div className="mtr-next-moves-actions">
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => navigate(PLAYBOOK_HUB_PATH)}>
              Classify executions
            </button>
            <button type="button" className="trader-suite-btn" onClick={() => navigate(`${TV_BASE}/checklist`)}>
              Pre-trade checklist
            </button>
            <Link to={`${TV_BASE}/journal`} className="trader-suite-btn mtr-next-moves-link">
              Trade journal
            </Link>
          </div>
        </section>
        <section className="tp-panel">
          <span className="mtr-kicker">Refinement notes</span>
          {!sortedNotes.length ? (
            <p className="tp-detail-glance-empty" style={{ marginTop: 8 }}>
              No notes for this playbook yet.
            </p>
          ) : (
            <ul className="mtr-timeline">
              {sortedNotes.map((n) => (
                <li key={n.id}>
                  <time dateTime={n.createdAt}>{fmtShortDate(n.createdAt)}</time>
                  <h4>{n.title || 'Note'}</h4>
                  <p>{clipText(n.body, 160)}</p>
                  <button
                    type="button"
                    className="tp-inline-link"
                    style={{ marginTop: 4 }}
                    onClick={() => navigate(PLAYBOOK_HUB_PATH)}
                  >
                    Revisit in playbook
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  };

  return (
    <TraderSuiteShell
      variant="terminal"
      terminalPresentation="aura-dashboard"
      eyebrow={formatWelcomeEyebrow(user)}
      title="Missed Trade Review"
      description="Review and learn from missed setups"
      stats={[]}
      primaryAction={
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={reviewNext}>
          Review next miss
        </button>
      }
      secondaryActions={
        <Link to={PLAYBOOK_HUB_PATH} className="trader-suite-btn">
          Playbook hub
        </Link>
      }
    >
      <div className="tp-root mtr-root">
        <div className="tp-hub-max">
        {loading ? (
          <p className="tp-loading-caption" aria-busy="true">
            Loading misses, executions, and playbook context…
          </p>
        ) : (
          <>
            {statsStrip}
            <nav className="tp-terminal-flow tp-terminal-flow--compact" aria-label="Execution workspace">
              <span className="tp-terminal-flow__label">Workspace</span>
              <div className="tp-terminal-flow__links">
                <Link to={PLAYBOOK_HUB_PATH} className="tp-terminal-flow__link">
                  Playbook
                </Link>
                <span className="tp-terminal-flow__sep" aria-hidden>
                  ·
                </span>
                <Link to={`${TV_BASE}/checklist`} className="tp-terminal-flow__link">
                  Checklist
                </Link>
                <span className="tp-terminal-flow__sep" aria-hidden>
                  ·
                </span>
                <Link to={`${TV_BASE}/calculator`} className="tp-terminal-flow__link">
                  Calculator
                </Link>
              </div>
            </nav>
            <div className="mtr-grid">
              <div className="mtr-col">
                <div className="mtr-tabs" role="tablist" aria-label="Review scope">
                  {[
                    { id: 'missed', label: 'Missed setups' },
                    { id: 'offplan', label: 'Off-plan trades' },
                    { id: 'hesitation', label: 'Hesitation' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={mainTab === t.id}
                      className={`mtr-tab${mainTab === t.id ? ' mtr-tab--active' : ''}`}
                      onClick={() => {
                        setMainTab(t.id);
                        setSelectedMId(null);
                        setSelectedOffKey(null);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="mtr-toolbar">
                  <button type="button" className="trader-suite-btn" onClick={() => setFilterOpen((o) => !o)}>
                    Sort &amp; filter
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(200,196,232,0.45)' }}>{listCount} in view</span>
                </div>
                {filterOpen && mainTab !== 'offplan' ? (
                  <div className="tp-panel tp-panel--tight" style={{ marginBottom: 8 }}>
                    <div className="tp-field-grid">
                      <div className="tp-field">
                        <label>Playbook</label>
                        <select className="tp-select" value={playbookFilter} onChange={(e) => setPlaybookFilter(e.target.value)}>
                          <option value="">All playbooks</option>
                          {setups.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="tp-field">
                        <label>Sort date</label>
                        <select className="tp-select" value={sortDesc ? 'desc' : 'asc'} onChange={(e) => setSortDesc(e.target.value === 'desc')}>
                          <option value="desc">Newest first</option>
                          <option value="asc">Oldest first</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : null}
                {mainTab === 'offplan' ? (
                  !offPlanRows.length ? (
                    <div className="mtr-empty mtr-empty--line">No off-plan rows in the loaded Operator + journal sample.</div>
                  ) : (
                    <ul className="mtr-list" role="listbox" aria-label="Off-plan trades">
                      {offPlanRows.map((r) => (
                        <li key={r.key}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedOffKey === r.key}
                            className={`mtr-list-row${selectedOffKey === r.key ? ' mtr-list-row--selected' : ''}`}
                            onClick={() => setSelectedOffKey(r.key)}
                          >
                            <div>
                              <div className="mtr-list-row__date">{fmtShortDate(r.at)}</div>
                              <div className="mtr-list-row__title">{r.label}</div>
                            </div>
                            <div className="mtr-list-row__tags">
                              <span className="mtr-tag">{r.source === 'validator' ? 'V' : 'J'}</span>
                              <span className="mtr-tag">{noSetupLabel(r.reason)}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : !mFiltered.length ? (
                  <div className="mtr-empty mtr-empty--line">
                    No rows for this filter. Log misses from the playbook hub or widen the filter.
                  </div>
                ) : (
                  <ul className="mtr-list" role="listbox" aria-label="Missed setups">
                    {mFiltered.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedMId === m.id}
                          className={`mtr-list-row${selectedMId === m.id ? ' mtr-list-row--selected' : ''}`}
                          onClick={() => setSelectedMId(m.id)}
                        >
                          <div>
                            <div className="mtr-list-row__date">{fmtShortDate(m.occurredAt || m.createdAt)}</div>
                            <div className="mtr-list-row__title">{playbookById[m.playbookId] || m.asset || 'Missed setup'}</div>
                          </div>
                          <div className="mtr-list-row__tags">
                            {m.missType ? <span className="mtr-tag">{missTypeLabel(m.missType)}</span> : null}
                            {m.asset ? <span className="mtr-tag mtr-chip--neutral">{m.asset}</span> : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {chartBlock()}

                {mainTab === 'offplan' && selectedOff ? (
                  <section className="tp-panel" aria-label="Trade details">
                    <span className="mtr-kicker">Trade details</span>
                    <dl className="mtr-diag-grid" style={{ marginTop: 8 }}>
                      <div className="mtr-diag-row">
                        <dt>Execution</dt>
                        <dd>{selectedOff.label}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Classifier</dt>
                        <dd>{selectedOff.source === 'validator' ? 'Operator' : 'Journal'}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Date</dt>
                        <dd>{fmtShortDate(selectedOff.at)}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Off-plan driver</dt>
                        <dd>{noSetupLabel(selectedOff.reason)}</dd>
                      </div>
                    </dl>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <button type="button" className="trader-suite-btn" onClick={() => navigate(PLAYBOOK_HUB_PATH)}>
                        Classify in playbook
                      </button>
                    </div>
                  </section>
                ) : null}
                {mainTab !== 'offplan' && selectedM ? (
                  <section className="tp-panel" aria-label="Trade details">
                    <span className="mtr-kicker">Trade details</span>
                    <dl className="mtr-diag-grid" style={{ marginTop: 8 }}>
                      <div className="mtr-diag-row">
                        <dt>Playbook</dt>
                        <dd>{playbookById[selectedM.playbookId] || 'Unlinked'}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Pattern</dt>
                        <dd>{missTypeLabel(selectedM.missType)}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Date</dt>
                        <dd>{fmtShortDate(selectedM.occurredAt || selectedM.createdAt)}</dd>
                      </div>
                      <div className="mtr-diag-row">
                        <dt>Potential result</dt>
                        <dd className="mtr-stat-chip__v--muted">Not captured on miss rows</dd>
                      </div>
                    </dl>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <button type="button" className="trader-suite-btn" onClick={() => navigate(PLAYBOOK_HUB_PATH)}>
                        Open playbook
                      </button>
                      <button type="button" className="trader-suite-btn" onClick={() => navigate('/trader-deck/trade-validator/journal')}>
                        Trade journal
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="mtr-col">{centerAnalysis()}</div>

              <div className="mtr-col mtr-col--right">{rightColumn()}</div>
            </div>
          </>
        )}
        </div>
      </div>
    </TraderSuiteShell>
  );
}
