import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradingViewWidgetEmbed from '../components/TradingViewWidgetEmbed';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
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
  marketBias: 'Bearish',
  marketState: 'Trending',
  auraConfidence: 62,
  todaysFocus: 'Wait for confirmation.',
  sessionGoal: 'Wait for confirmation.',
  maxTradesAllowed: 3,
  whatDoISee: 'Bearish pullback into structure with downside continuation pressure.',
  setupName: 'Pullback Continuation',
  whyValid: 'Bias aligned, continuation structure intact, and entry sits below recent weakness.',
  entryConfirmation: 'Lower-high rejection and continuation close.',
  confidence: 62,
  riskLevel: 'Medium',
  entryPrice: 1.085,
  stopLoss: 1.082,
  targetPrice: 1.092,
  riskPercent: 1,
  biasAligned: true,
  setupValid: true,
  entryConfirmed: true,
  riskDefined: true,
  livePnlR: 1.5,
  livePnlPercent: 0.8,
  currentPrice: 1.0836,
  distanceToSl: 30,
  distanceToTp: 70,
  emotions: 'Focused',
  duringNotes: 'Entered slightly early.',
  outcome: 'win',
  resultR: 2.5,
  durationMinutes: 96,
  followedRules: true,
  entryCorrect: true,
  exitCorrect: false,
  whatToChange: 'Wait one more candle for cleaner confirmation.',
  emotionalIntensity: 34,
  mistakeTags: ['early entry'],
};

function normalizeSession(session = {}) {
  return {
    ...DEFAULT_FORM,
    ...session,
    mistakeTags: Array.isArray(session.mistakeTags) ? session.mistakeTags : DEFAULT_FORM.mistakeTags,
  };
}

export default function TraderLab() {
  const { user } = useAuth();
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

  const validator = useMemo(() => buildValidator(form), [form]);
  const behaviour = useMemo(() => buildBehaviourSummary(form), [form]);

  const stats = useMemo(
    () => [
      { label: 'Market Bias', value: form.marketBias },
      { label: 'Confidence', value: `${form.auraConfidence}%` },
      { label: 'Market State', value: form.marketState },
      { label: 'Risk', value: form.riskLevel },
    ],
    [form.auraConfidence, form.marketBias, form.marketState, form.riskLevel]
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

  return (
    <TraderSuiteShell
      variant="terminal"
      eyebrow={formatWelcomeEyebrow(user)}
      title="Aura Terminal - Trader Lab"
      description="Terminal-style layout for the active trade workspace. Big chart first, compact decision panels beside it, and live metrics anchored underneath."
      stats={stats}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSession} disabled={saving}>
          {saving ? 'Saving...' : 'Save lab'}
        </button>
      )}
      secondaryActions={(
        <>
          <button type="button" className="trader-suite-btn" onClick={createFreshSession}>New session</button>
          <Link to="/trader-deck/trade-validator/trader-playbook" className="trader-suite-btn">Playbook</Link>
          <Link to="/trader-deck/trade-validator/trader-replay" className="trader-suite-btn">Replay</Link>
        </>
      )}
    >
      {loading ? <div className="trader-suite-empty">Loading lab sessions...</div> : null}

      <div className="trader-lab-terminal">
        <section className="trader-suite-panel trader-lab-terminal__chart">
          <div className="trader-lab-terminal__chart-head">
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
            <span className={`trader-suite-badge${validator.passed ? ' trader-suite-badge--good' : ' trader-suite-badge--bad'}`}>
              {validator.passed ? 'Valid Trade' : 'Blocked'}
            </span>
          </div>
          <TradingViewWidgetEmbed symbol="OANDA:EURUSD" interval="15" height={430} studies={['STD;Volume']} />
          <div className="trader-lab-terminal__chart-levels">
            <div className="trader-suite-card-lite">
              <strong>Entry</strong>
              <p>{form.entryPrice}</p>
            </div>
            <div className="trader-suite-card-lite">
              <strong>Stop Loss</strong>
              <p>{form.stopLoss}</p>
            </div>
            <div className="trader-suite-card-lite">
              <strong>Take Profit</strong>
              <p>{form.targetPrice}</p>
            </div>
          </div>
        </section>

        <div className="trader-lab-terminal__stack">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Pre-Trade Thinking</div>
            <div className="trader-suite-field">
              <label>What do you see?</label>
              <textarea className="trader-suite-textarea" value={form.whatDoISee} onChange={(e) => updateField('whatDoISee', e.target.value)} />
            </div>
            <div className="trader-suite-field" style={{ marginTop: 12 }}>
              <label>Setup</label>
              <select className="trader-suite-select" value={form.setupName} onChange={(e) => updateField('setupName', e.target.value)}>
                {playbookSetups.map((setupName) => (
                  <option key={setupName} value={setupName}>{setupName}</option>
                ))}
              </select>
            </div>
            <div className="trader-suite-field" style={{ marginTop: 12 }}>
              <label>Confidence</label>
              <input type="range" min="1" max="100" className="trader-suite-slider" value={form.confidence} onChange={(e) => updateField('confidence', safeNumber(e.target.value))} />
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div className="trader-suite-kicker">Trade Plan</div>
              <span className={`trader-suite-badge${rr >= 2 ? ' trader-suite-badge--good' : ' trader-suite-badge--warn'}`}>{formatRatio(rr)}</span>
            </div>
            <div className="trader-suite-field-grid">
              <div className="trader-suite-field trader-suite-field--span-6">
                <label>Entry</label>
                <input className="trader-suite-input" type="number" step="0.0001" value={form.entryPrice} onChange={(e) => updateField('entryPrice', e.target.value)} />
              </div>
              <div className="trader-suite-field trader-suite-field--span-6">
                <label>Stop</label>
                <input className="trader-suite-input" type="number" step="0.0001" value={form.stopLoss} onChange={(e) => updateField('stopLoss', e.target.value)} />
              </div>
              <div className="trader-suite-field trader-suite-field--span-6">
                <label>Target</label>
                <input className="trader-suite-input" type="number" step="0.0001" value={form.targetPrice} onChange={(e) => updateField('targetPrice', e.target.value)} />
              </div>
              <div className="trader-suite-field trader-suite-field--span-6">
                <label>Risk %</label>
                <input className="trader-suite-input" type="number" step="0.1" value={form.riskPercent} onChange={(e) => updateField('riskPercent', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Trade Validator</div>
            <div className="trader-suite-checklist trader-lab-terminal__validator">
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
            <div style={{ marginTop: 12 }} className="trader-suite-progress">
              <span style={{ width: `${validator.score}%` }} />
            </div>
          </section>
        </div>

        <div className="trader-lab-terminal__rail">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Session Goal</div>
            <textarea className="trader-suite-textarea" value={form.sessionGoal} onChange={(e) => updateField('sessionGoal', e.target.value)} />
          </section>
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Mistake Tags</div>
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
            <div className="trader-suite-kicker">Quick Notes</div>
            <textarea className="trader-suite-textarea" value={form.duringNotes} onChange={(e) => updateField('duringNotes', e.target.value)} />
          </section>
        </div>

        <section className="trader-suite-panel trader-lab-terminal__footer">
          <div className="trader-lab-terminal__footer-head">
            <div className="trader-suite-kicker">Live Trade Metrics</div>
            <div className="trader-suite-cta-row">
              <Link to="/trader-deck/trade-validator/trader-playbook" className="trader-suite-btn">Playbook</Link>
              <Link to="/trader-deck/trade-validator/trader-replay" className="trader-suite-btn trader-suite-btn--primary">Replay</Link>
            </div>
          </div>
          <div className="trader-lab-terminal__footer-grid">
            <div className="trader-suite-card-lite"><strong>P&amp;L</strong><p>{form.livePnlPercent}%</p></div>
            <div className="trader-suite-card-lite"><strong>R Multiple</strong><p>{form.livePnlR}R</p></div>
            <div className="trader-suite-card-lite"><strong>To Stop</strong><p>{form.distanceToSl} pips</p></div>
            <div className="trader-suite-card-lite"><strong>To Target</strong><p>{form.distanceToTp} pips</p></div>
            <div className="trader-suite-card-lite"><strong>Discipline Score</strong><p>{behaviour.discipline}/100</p></div>
            <div className="trader-suite-card-lite"><strong>Behaviour Insight</strong><p>{behaviour.issue}</p></div>
          </div>
        </section>
      </div>
    </TraderSuiteShell>
  );
}
