import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import Api from '../services/Api';
import {
  MISTAKE_TAG_OPTIONS,
  PLAYBOOK_SETUP_OPTIONS,
  buildBehaviourSummary,
  buildValidator,
  calculateRiskReward,
  formatRatio,
  safeNumber,
  toYmd,
} from '../utils/traderSuite';

const DEFAULT_FORM = {
  sessionDate: toYmd(),
  marketBias: 'Bullish intraday',
  marketState: 'trend',
  auraConfidence: 72,
  todaysFocus: 'Wait for pullbacks after liquidity sweep confirmation.',
  sessionGoal: 'No overtrading and no impulse entries.',
  maxTradesAllowed: 3,
  whatDoISee: 'Higher-low structure forming above London low with clean displacement.',
  setupName: 'London Breakout',
  whyValid: 'Bias aligned, reclaim confirmed, and volatility supports continuation.',
  entryConfirmation: 'M5 close back above reclaim candle high.',
  confidence: 74,
  riskLevel: 'Controlled',
  entryPrice: 1.2748,
  stopLoss: 1.2729,
  targetPrice: 1.2796,
  riskPercent: 0.5,
  biasAligned: true,
  setupValid: true,
  entryConfirmed: true,
  riskDefined: true,
  livePnlR: 1.4,
  livePnlPercent: 0.7,
  currentPrice: 1.2775,
  distanceToSl: 0.36,
  distanceToTp: 0.52,
  emotions: 'Calm, focused, slightly impatient while waiting.',
  duringNotes: 'Stayed patient until close confirmation printed.',
  outcome: 'win',
  resultR: 2.52,
  durationMinutes: 96,
  followedRules: true,
  entryCorrect: true,
  exitCorrect: true,
  whatToChange: 'Hold runner for higher-timeframe continuation once 1R is secured.',
  emotionalIntensity: 34,
  mistakeTags: ['late exit'],
};

function normalizeSession(session = {}) {
  return {
    ...DEFAULT_FORM,
    ...session,
    mistakeTags: Array.isArray(session.mistakeTags) ? session.mistakeTags : DEFAULT_FORM.mistakeTags,
  };
}

export default function TraderLab() {
  const [sessions, setSessions] = useState([]);
  const [playbookSetups, setPlaybookSetups] = useState(PLAYBOOK_SETUP_OPTIONS);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([Api.getTraderLabSessions(), Api.getTraderPlaybookSetups()])
      .then(([sessionsRes, playbookRes]) => {
        if (!active) return;

        const nextSessions = sessionsRes.status === 'fulfilled' && Array.isArray(sessionsRes.value?.data?.sessions)
          ? sessionsRes.value.data.sessions.map(normalizeSession)
          : [];
        const nextSetups = playbookRes.status === 'fulfilled' && Array.isArray(playbookRes.value?.data?.setups)
          ? playbookRes.value.data.setups.map((item) => item.name).filter(Boolean)
          : [];

        if (nextSessions.length) {
          setSessions(nextSessions);
          setActiveId(nextSessions[0].id);
          setForm(nextSessions[0]);
        } else {
          setSessions([]);
          setActiveId(null);
          setForm(DEFAULT_FORM);
        }

        if (nextSetups.length) {
          setPlaybookSetups(nextSetups);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const rr = useMemo(
    () => calculateRiskReward(form.entryPrice, form.stopLoss, form.targetPrice),
    [form.entryPrice, form.stopLoss, form.targetPrice]
  );

  const validator = useMemo(
    () => buildValidator(form),
    [form]
  );

  const behaviour = useMemo(
    () => buildBehaviourSummary(form),
    [form]
  );

  const stats = useMemo(
    () => [
      { label: 'Aura bias', value: form.marketBias, note: form.marketState },
      { label: 'Confidence', value: `${form.auraConfidence}%`, note: form.setupName },
      { label: 'R:R plan', value: formatRatio(rr), note: `${form.riskPercent}% risk` },
      { label: 'Validator', value: `${validator.score}%`, note: validator.passed ? 'Trade quality aligned' : 'Needs work' },
    ],
    [form.auraConfidence, form.marketBias, form.marketState, form.riskPercent, form.setupName, rr, validator]
  );

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMistakeTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      mistakeTags: prev.mistakeTags.includes(tag)
        ? prev.mistakeTags.filter((item) => item !== tag)
        : [...prev.mistakeTags, tag],
    }));
  };

  const saveSession = async () => {
    setSaving(true);
    try {
      const payload = { ...form, rrRatio: rr };
      if (activeId) {
        const res = await Api.updateTraderLabSession(activeId, payload);
        const saved = normalizeSession(res?.data?.session || { ...payload, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
      }
      toast.success('Trader Lab saved');
    } catch (error) {
      console.error(error);
      toast.error('Could not save Trader Lab yet');
    } finally {
      setSaving(false);
    }
  };

  const createFreshSession = () => {
    setActiveId(null);
    setForm({ ...DEFAULT_FORM, sessionDate: toYmd() });
  };

  const summaryMetrics = [
    { label: 'Trades taken', value: sessions.length || 1 },
    { label: 'Win rate', value: `${Math.round(((sessions.filter((item) => item.outcome === 'win').length || 1) / Math.max(sessions.length, 1)) * 100)}%` },
    { label: 'Total R', value: `${sessions.reduce((acc, item) => acc + safeNumber(item.resultR, 0), safeNumber(form.resultR, 0)).toFixed(1)}R` },
    { label: 'Mistake tags', value: form.mistakeTags.length || 0 },
  ];

  const activePhase = validator.passed ? (form.outcome ? 5 : 4) : 3;

  return (
    <TraderSuiteShell
      eyebrow="Trader Workflow / Step 2"
      title="Trader Lab"
      description="Run the trade through a sequence: session context, setup thesis, validation, live management, then fast closeout. The dominant action should always be obvious."
      stats={stats}
      status={{
        title: validator.passed ? 'Trade can move into execution' : 'Trade is intentionally blocked',
        body: validator.label,
      }}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSession} disabled={saving}>
          {saving ? 'Saving...' : activePhase < 4 ? 'Save plan' : activePhase === 4 ? 'Save live session' : 'Save closeout'}
        </button>
      )}
      secondaryActions={(
        <>
          <button type="button" className="trader-suite-btn" onClick={createFreshSession}>New session</button>
          <Link to="/trader-playbook" className="trader-suite-btn">Check rules in Playbook</Link>
          <Link to="/trader-replay" className="trader-suite-btn">Send closed trade to Replay</Link>
        </>
      )}
      workflowSteps={[
        { index: '1', label: 'Session context', note: 'Bias, focus, and session constraints.', complete: true },
        { index: '2', label: 'Setup thesis', note: 'What you see and why it belongs.', complete: Boolean(form.whatDoISee) },
        { index: '3', label: 'Validation', note: 'Checklist, risk, and R:R gate.', active: activePhase === 3 },
        { index: '4', label: 'Live tracking', note: 'Monitor execution and psychology.', active: activePhase === 4 },
        { index: '5', label: 'Closeout', note: 'Review, tags, and next action.', active: activePhase === 5 },
      ]}
      railTitle="Session guide"
      railContent={(
        <div className="trader-suite-rail-stack">
          <div className="trader-suite-summary-card">
            <h3>Current setup path</h3>
            <p>
              {form.setupName} with {form.marketBias.toLowerCase()} bias, {form.confidence}% trade confidence, and a planned {formatRatio(rr)} profile.
            </p>
          </div>
          <div className="trader-suite-card-lite">
            <strong>Next best action</strong>
            <p>
              {activePhase < 4
                ? 'Finish validation before entering. Bias, confirmation, and risk must all be aligned.'
                : activePhase === 4
                  ? 'Stay process-focused while the trade is live. Track emotion and manage around the plan.'
                  : 'Close the loop quickly, tag the mistake pattern, and route the trade into Replay.'}
            </p>
          </div>
        </div>
      )}
    >
      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Step 1</div>
            <h2>Session context</h2>
            <p>Start with the environment so your trade idea is grounded before you move into the thesis.</p>
          </div>
          <div className="trader-suite-toolbar">
            {sessions.slice(0, 4).map((session) => (
              <button
                key={session.id}
                type="button"
                className={`trader-suite-tab-btn${session.id === activeId ? ' trader-suite-tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveId(session.id);
                  setForm(normalizeSession(session));
                }}
              >
                {session.sessionDate}
              </button>
            ))}
          </div>
        </div>
        {loading ? <div className="trader-suite-empty">Loading lab sessions...</div> : null}
        <div className="trader-suite-field-grid">
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Date</label>
            <input type="date" className="trader-suite-input" value={form.sessionDate} onChange={(e) => updateField('sessionDate', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Current market bias</label>
            <input className="trader-suite-input" value={form.marketBias} onChange={(e) => updateField('marketBias', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Market state</label>
            <select className="trader-suite-select" value={form.marketState} onChange={(e) => updateField('marketState', e.target.value)}>
              <option value="trend">Trend</option>
              <option value="range">Range</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Aura confidence</label>
            <div className="trader-suite-inline">
              <input type="range" min="1" max="100" className="trader-suite-slider" value={form.auraConfidence} onChange={(e) => updateField('auraConfidence', safeNumber(e.target.value))} />
              <span>{form.auraConfidence}%</span>
            </div>
          </div>
          <div className="trader-suite-field trader-suite-field--span-5">
            <label>Today's focus</label>
            <textarea className="trader-suite-textarea" value={form.todaysFocus} onChange={(e) => updateField('todaysFocus', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-5">
            <label>Session goal</label>
            <textarea className="trader-suite-textarea" value={form.sessionGoal} onChange={(e) => updateField('sessionGoal', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-2">
            <label>Max trades</label>
            <input type="number" min="1" className="trader-suite-input" value={form.maxTradesAllowed} onChange={(e) => updateField('maxTradesAllowed', safeNumber(e.target.value))} />
          </div>
        </div>
      </section>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 2</div>
              <h2>Setup selection and trade thesis</h2>
              <p>Decide what setup this is, what you see, why it qualifies, and what confirmation gives you permission to act.</p>
            </div>
            <span className="trader-suite-badge">{form.setupName}</span>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>What do I see?</label>
              <textarea className="trader-suite-textarea" value={form.whatDoISee} onChange={(e) => updateField('whatDoISee', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-5">
              <label>Setup type</label>
              <select className="trader-suite-select" value={form.setupName} onChange={(e) => updateField('setupName', e.target.value)}>
                {playbookSetups.map((setupName) => (
                  <option key={setupName} value={setupName}>{setupName}</option>
                ))}
              </select>
            </div>
            <div className="trader-suite-field trader-suite-field--span-4">
              <label>Confidence</label>
              <div className="trader-suite-inline">
                <input type="range" min="1" max="100" className="trader-suite-slider" value={form.confidence} onChange={(e) => updateField('confidence', safeNumber(e.target.value))} />
                <span>{form.confidence}%</span>
              </div>
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Risk level</label>
              <select className="trader-suite-select" value={form.riskLevel} onChange={(e) => updateField('riskLevel', e.target.value)}>
                <option value="Controlled">Controlled</option>
                <option value="Moderate">Moderate</option>
                <option value="Aggressive">Aggressive</option>
              </select>
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Why is this valid?</label>
              <textarea className="trader-suite-textarea" value={form.whyValid} onChange={(e) => updateField('whyValid', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>What confirms entry?</label>
              <textarea className="trader-suite-textarea" value={form.entryConfirmation} onChange={(e) => updateField('entryConfirmation', e.target.value)} />
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Thesis summary</div>
                <h2>Does the idea belong?</h2>
              </div>
            </div>
            <div className="trader-suite-note-list">
              <div className="trader-suite-note">
                <strong>Setup</strong>
                <p>{form.setupName}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Why valid</strong>
                <p>{form.whyValid}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Confirmation</strong>
                <p>{form.entryConfirmation}</p>
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Workflow handoff</div>
                <h2>Rule reference</h2>
              </div>
            </div>
            <div className="trader-suite-cta-row">
              <Link to="/trader-playbook" className="trader-suite-btn">Open setup rules</Link>
            </div>
          </section>
        </aside>
      </div>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 3</div>
              <h2>Validation and risk plan</h2>
              <p>Turn the thesis into a measurable trade and stop the entry if the plan is not properly defined.</p>
            </div>
            <span className={`trader-suite-badge${rr >= 2 ? ' trader-suite-badge--good' : rr >= 1.5 ? ' trader-suite-badge--warn' : ' trader-suite-badge--bad'}`}>
              {formatRatio(rr)}
            </span>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Entry</label>
              <input className="trader-suite-input" type="number" step="0.0001" value={form.entryPrice} onChange={(e) => updateField('entryPrice', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Stop loss</label>
              <input className="trader-suite-input" type="number" step="0.0001" value={form.stopLoss} onChange={(e) => updateField('stopLoss', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Target</label>
              <input className="trader-suite-input" type="number" step="0.0001" value={form.targetPrice} onChange={(e) => updateField('targetPrice', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Risk %</label>
              <input className="trader-suite-input" type="number" step="0.1" value={form.riskPercent} onChange={(e) => updateField('riskPercent', e.target.value)} />
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Validator gate</div>
                <h2>Only pass if all checks are true</h2>
              </div>
              <span className={`trader-suite-badge${validator.passed ? ' trader-suite-badge--good' : ' trader-suite-badge--bad'}`}>
                {validator.score}%
              </span>
            </div>
            <div className="trader-suite-checklist">
              {[
                ['Setup valid', 'setupValid'],
                ['Bias aligned', 'biasAligned'],
                ['Entry confirmed', 'entryConfirmed'],
                ['Risk defined', 'riskDefined'],
              ].map(([label, key]) => (
                <label key={key} className="trader-suite-check">
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => updateField(key, e.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="trader-suite-inline trader-suite-inline--between" style={{ marginBottom: 8 }}>
                <strong>Checklist completion</strong>
                <span>{validator.score}%</span>
              </div>
              <div className="trader-suite-progress">
                <span style={{ width: `${validator.score}%` }} />
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-metric-grid">
              <div className="trader-suite-metric">
                <h3>Playbook fit</h3>
                <p>{form.setupValid ? 'Yes' : 'No'}</p>
              </div>
              <div className="trader-suite-metric">
                <h3>Risk warning</h3>
                <p style={{ fontSize: '1rem' }}>{safeNumber(form.riskPercent) > 1 ? 'Above rule' : 'Within rule'}</p>
              </div>
              <div className="trader-suite-metric">
                <h3>Reward</h3>
                <p>{formatRatio(rr)}</p>
              </div>
              <div className="trader-suite-metric">
                <h3>Entry state</h3>
                <p>{form.entryConfirmed ? 'Confirmed' : 'Waiting'}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 4</div>
              <h2>Live trade tracking</h2>
              <p>Once the trade is active, track execution and psychology together instead of treating them as separate events.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--warn">{form.livePnlR}R live</span>
          </div>
          <div className="trader-suite-metric-grid">
            <div className="trader-suite-metric">
              <h3>Live PnL</h3>
              <p>{form.livePnlPercent}%</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Current price</h3>
              <p>{form.currentPrice}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Distance to SL</h3>
              <p>{form.distanceToSl}%</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Distance to TP</h3>
              <p>{form.distanceToTp}%</p>
            </div>
          </div>
          <div className="trader-suite-field-grid" style={{ marginTop: 18 }}>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Emotions</label>
              <textarea className="trader-suite-textarea" value={form.emotions} onChange={(e) => updateField('emotions', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Notes during trade</label>
              <textarea className="trader-suite-textarea" value={form.duringNotes} onChange={(e) => updateField('duringNotes', e.target.value)} />
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Execution state</div>
                <h2>Stay aligned while live</h2>
              </div>
            </div>
            <div className="trader-suite-list">
              <li>Bias aligned: {form.biasAligned ? 'Yes' : 'No'}</li>
              <li>Confirmation respected: {form.entryConfirmed ? 'Yes' : 'No'}</li>
              <li>Risk defined before entry: {form.riskDefined ? 'Yes' : 'No'}</li>
            </div>
          </section>
        </aside>
      </div>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 5</div>
              <h2>Quick closeout review</h2>
              <p>End with a fast review: result, process quality, behavior, mistake tags, and the next workflow handoff.</p>
            </div>
            <span className={`trader-suite-badge${form.outcome === 'win' ? ' trader-suite-badge--good' : form.outcome === 'loss' ? ' trader-suite-badge--bad' : ' trader-suite-badge--warn'}`}>
              {form.outcome.toUpperCase()}
            </span>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Outcome</label>
              <select className="trader-suite-select" value={form.outcome} onChange={(e) => updateField('outcome', e.target.value)}>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="be">Break even</option>
              </select>
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>R result</label>
              <input className="trader-suite-input" type="number" step="0.1" value={form.resultR} onChange={(e) => updateField('resultR', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Duration (mins)</label>
              <input className="trader-suite-input" type="number" value={form.durationMinutes} onChange={(e) => updateField('durationMinutes', safeNumber(e.target.value))} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Emotional intensity</label>
              <div className="trader-suite-inline">
                <input type="range" min="1" max="100" className="trader-suite-slider" value={form.emotionalIntensity} onChange={(e) => updateField('emotionalIntensity', safeNumber(e.target.value))} />
                <span>{form.emotionalIntensity}</span>
              </div>
            </div>
            <div className="trader-suite-checklist" style={{ gridColumn: 'span 12' }}>
              {[
                ['Did I follow my rules?', 'followedRules'],
                ['Was entry correct?', 'entryCorrect'],
                ['Was exit correct?', 'exitCorrect'],
              ].map(([label, key]) => (
                <label key={key} className="trader-suite-check">
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => updateField(key, e.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>What would I change?</label>
              <textarea className="trader-suite-textarea" value={form.whatToChange} onChange={(e) => updateField('whatToChange', e.target.value)} />
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Behavior Tracking</div>
              <h2>Discipline and emotional control</h2>
              <p>Use the session data to score how well you respected the process, not just the result.</p>
            </div>
            <span className="trader-suite-badge">{behaviour.discipline}/100 discipline</span>
          </div>
          <div className="trader-suite-metric-grid">
            <div className="trader-suite-metric">
              <h3>Discipline</h3>
              <p>{behaviour.discipline}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Emotional control</h3>
              <p>{behaviour.emotionalControl}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Rules adherence</h3>
              <p>{form.followedRules ? 'Aligned' : 'Broken'}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Main issue</h3>
              <p style={{ fontSize: '0.98rem' }}>{behaviour.issue}</p>
            </div>
          </div>
          <div className="trader-suite-section-header" style={{ marginTop: 20, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0 }}>Mistake tagging</h2>
              <p>These tags feed Replay and long-term behavior patterning later.</p>
            </div>
          </div>
          <div className="trader-suite-tag-row">
            {MISTAKE_TAG_OPTIONS.map((tag) => (
              <label key={tag} className="trader-suite-tag">
                <input type="checkbox" checked={form.mistakeTags.includes(tag)} onChange={() => toggleMistakeTag(tag)} />
                <span>{tag}</span>
              </label>
            ))}
          </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Workflow handoff</div>
                <h2>Where this trade goes next</h2>
              </div>
            </div>
            <div className="trader-suite-cta-row">
              <Link to="/trader-replay" className="trader-suite-btn trader-suite-btn--primary">Send closed trade to Replay</Link>
              <Link to="/trader-playbook" className="trader-suite-btn">Compare against Playbook</Link>
            </div>
          </section>
        </aside>
      </div>

      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Daily Summary</div>
            <h2>Close the loop</h2>
            <p>Turn the session into one clear lesson, then push it into the next stage of the workflow.</p>
          </div>
          <div className="trader-suite-actions-row">
            <Link to="/trader-replay" className="trader-suite-btn trader-suite-btn--primary">Send trade to Replay</Link>
            <Link to="/trader-playbook" className="trader-suite-btn">Return to Playbook rules</Link>
          </div>
        </div>
        <div className="trader-suite-metric-grid">
          {summaryMetrics.map((metric) => (
            <div key={metric.label} className="trader-suite-metric">
              <h3>{metric.label}</h3>
              <p>{metric.value}</p>
            </div>
          ))}
        </div>
        <div className="trader-suite-note" style={{ marginTop: 18 }}>
          <strong>System insight</strong>
          <p>
            {validator.passed
              ? 'Your process was aligned. The main refinement is to keep pressing patience after confirmation so winners can breathe.'
              : 'The validator is flagging this idea for a reason. Slow down until bias, confirmation, and risk all line up together.'}
          </p>
        </div>
      </section>
    </TraderSuiteShell>
  );
}
