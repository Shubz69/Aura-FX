import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import Api from '../services/Api';
import { PLAYBOOK_SETUP_OPTIONS } from '../utils/traderSuite';

const DEFAULT_SETUP = {
  name: 'London Breakout',
  marketType: 'trend',
  timeframes: 'M15 / H1 / H4',
  assets: 'GBPUSD, EURUSD, XAUUSD',
  session: 'London',
  biasRequirement: 'Only trade with Aura bias and HTF structure alignment.',
  structureRequirement: 'Clear sweep into support/resistance followed by reclaim.',
  volatilityCondition: 'ATR above session average and clean impulsive candles.',
  sessionTiming: 'First 90 minutes of London open.',
  entryTrigger: 'Break + pullback + rejection candle close',
  confirmationType: 'Pullback confirmation',
  entryChecklist: ['Conditions met', 'Bias aligned', 'Entry confirmed', 'Risk defined'],
  stopPlacement: 'Below reclaim low or above reclaim high.',
  maxRisk: '0.5',
  positionSizing: 'Fixed fractional sizing using invalidation distance.',
  invalidationLogic: 'Lose reclaim level or close back inside the range.',
  partialsRule: 'Take 60% at 1.5R, trail the rest behind structure.',
  trailingLogic: 'Trail behind each new M5 swing once 1R is protected.',
  holdVsExit: 'Hold while structure is respected and momentum remains clean.',
  doNotTrade: ['Choppy market', 'No clear structure', 'News risk', 'Low conviction'],
  commonMistakes: ['Entering too early', 'Overtrading', 'Ignoring bias'],
  checklistNotes: 'If all four boxes are not true, there is no trade.',
  winRate: '58%',
  avgR: '2.1R',
  bestPerformance: '4.8R on trend continuation week',
  worstPerformance: '-1R after forcing pre-news breakout',
};

function normalizeSetup(setup = {}) {
  return {
    ...DEFAULT_SETUP,
    ...setup,
    entryChecklist: Array.isArray(setup.entryChecklist) ? setup.entryChecklist : DEFAULT_SETUP.entryChecklist,
    doNotTrade: Array.isArray(setup.doNotTrade) ? setup.doNotTrade : DEFAULT_SETUP.doNotTrade,
    commonMistakes: Array.isArray(setup.commonMistakes) ? setup.commonMistakes : DEFAULT_SETUP.commonMistakes,
  };
}

function SetupSummaryCard({ form }) {
  return (
    <div className="trader-suite-summary-card">
      <span className="trader-suite-rail-label">Setup summary</span>
      <h3>{form.name}</h3>
      <p>
        Best in {form.marketType} conditions during the {form.session} session, using {form.timeframes} across {form.assets}.
      </p>
      <div className="trader-suite-list" style={{ marginTop: 14 }}>
        <li>Qualifies when: {form.structureRequirement}</li>
        <li>Entry requires: {form.confirmationType} and {form.entryTrigger}</li>
        <li>Risk stays capped at {form.maxRisk}% with invalidation defined before entry.</li>
      </div>
    </div>
  );
}

export default function TraderPlaybook() {
  const [setups, setSetups] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_SETUP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Api.getTraderPlaybookSetups()
      .then((res) => {
        if (!active) return;
        const next = Array.isArray(res?.data?.setups) ? res.data.setups.map(normalizeSetup) : [];
        if (next.length) {
          setSetups(next);
          setActiveId(next[0].id);
          setForm(next[0]);
        } else {
          setSetups([]);
          setActiveId(null);
          setForm(DEFAULT_SETUP);
        }
      })
      .catch(() => {
        if (!active) return;
        setSetups([]);
        setActiveId(null);
        setForm(DEFAULT_SETUP);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: 'Setup', value: form.name, note: form.session },
      { label: 'Market fit', value: form.marketType, note: form.timeframes },
      { label: 'Risk cap', value: `${form.maxRisk}%`, note: 'Per idea' },
      { label: 'Avg performance', value: form.avgR, note: form.winRate },
    ],
    [form]
  );

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleArrayChange = (key, index, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].map((item, i) => (i === index ? value : item)),
    }));
  };

  const saveSetup = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (activeId) {
        const res = await Api.updateTraderPlaybookSetup(activeId, payload);
        const saved = normalizeSetup(res?.data?.setup || { ...payload, id: activeId });
        setSetups((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
      } else {
        const res = await Api.createTraderPlaybookSetup(payload);
        const saved = normalizeSetup(res?.data?.setup || payload);
        setSetups((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
      }
      toast.success('Playbook saved');
    } catch (error) {
      console.error(error);
      toast.error('Could not save playbook yet');
    } finally {
      setSaving(false);
    }
  };

  const createNewSetup = () => {
    const nextName = PLAYBOOK_SETUP_OPTIONS.find((option) => !setups.some((item) => item.name === option)) || 'Custom setup';
    setActiveId(null);
    setForm({ ...DEFAULT_SETUP, name: nextName });
  };

  return (
    <TraderSuiteShell
      eyebrow="Trader Workflow / Step 1"
      title="Trader Playbook"
      description="Build the rulebook first. This page should let a trader understand the setup in seconds, confirm what qualifies it, and push the idea directly into the live execution workflow."
      stats={stats}
      status={{
        title: 'Playbook is the source of truth',
        body: 'If the setup is not clear here, validation in Trader Lab and review in Trader Replay both become weaker.',
      }}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSetup} disabled={saving}>
          {saving ? 'Saving...' : 'Save playbook'}
        </button>
      )}
      secondaryActions={(
        <>
          <button type="button" className="trader-suite-btn" onClick={createNewSetup}>New setup</button>
          <Link to="/trader-lab" className="trader-suite-btn">Use this setup in Trader Lab</Link>
          <Link to="/trader-replay" className="trader-suite-btn">View linked Replay</Link>
        </>
      )}
      workflowSteps={[
        { index: '1', label: 'Define setup', note: 'What this idea is and when it belongs.', active: true },
        { index: '2', label: 'Qualify trade', note: 'What must be true before entry.' },
        { index: '3', label: 'Execute rules', note: 'Risk, management, and hard filters.' },
        { index: '4', label: 'Measure edge', note: 'Review how the setup actually performs.' },
      ]}
      railTitle="Operator note"
      railContent={<SetupSummaryCard form={form} />}
    >
      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Setup Library</div>
              <h2>Choose the strategy you are maintaining</h2>
              <p>Start with setup selection so every rule below belongs to one specific trading pattern.</p>
            </div>
            <span className="trader-suite-badge">Structured rules</span>
          </div>
          <div className="trader-suite-tab-row">
            {setups.map((setup) => (
              <button
                key={setup.id}
                type="button"
                className={`trader-suite-tab-btn${setup.id === activeId ? ' trader-suite-tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveId(setup.id);
                  setForm(normalizeSetup(setup));
                }}
              >
                {setup.name}
              </button>
            ))}
          </div>
          {loading ? <div className="trader-suite-empty" style={{ marginTop: 16 }}>Loading your saved setups...</div> : null}
          <div className="trader-suite-field-grid" style={{ marginTop: 18 }}>
            <div className="trader-suite-field trader-suite-field--span-5">
              <label>Strategy name</label>
              <input className="trader-suite-input" value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Market type</label>
              <select className="trader-suite-select" value={form.marketType} onChange={(e) => handleChange('marketType', e.target.value)}>
                <option value="trend">Trend</option>
                <option value="range">Range</option>
                <option value="mixed">Mixed</option>
                <option value="news">News-driven</option>
              </select>
            </div>
            <div className="trader-suite-field trader-suite-field--span-4">
              <label>Session</label>
              <input className="trader-suite-input" value={form.session} onChange={(e) => handleChange('session', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-4">
              <label>Timeframes</label>
              <input className="trader-suite-input" value={form.timeframes} onChange={(e) => handleChange('timeframes', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-8">
              <label>Pairs / assets</label>
              <input className="trader-suite-input" value={form.assets} onChange={(e) => handleChange('assets', e.target.value)} />
            </div>
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Qualification Snapshot</div>
              <h2>What makes this setup valid?</h2>
              <p>This should be scannable enough that a trader knows in seconds whether the idea belongs today or not.</p>
            </div>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>Bias requirement</label>
              <textarea className="trader-suite-textarea" value={form.biasRequirement} onChange={(e) => handleChange('biasRequirement', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>Market structure required</label>
              <textarea className="trader-suite-textarea" value={form.structureRequirement} onChange={(e) => handleChange('structureRequirement', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Volatility condition</label>
              <textarea className="trader-suite-textarea" value={form.volatilityCondition} onChange={(e) => handleChange('volatilityCondition', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Session timing</label>
              <textarea className="trader-suite-textarea" value={form.sessionTiming} onChange={(e) => handleChange('sessionTiming', e.target.value)} />
            </div>
          </div>
        </section>
      </div>

      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Entry Logic</div>
              <h2>What must happen before you click?</h2>
              <p>Separate the trigger from the confirmation so the setup is executable, not vague.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--good">Feeds Trader Lab validation</span>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Confirmation type</label>
              <input className="trader-suite-input" value={form.confirmationType} onChange={(e) => handleChange('confirmationType', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Entry trigger</label>
              <input className="trader-suite-input" value={form.entryTrigger} onChange={(e) => handleChange('entryTrigger', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>Entry checklist</label>
              <div className="trader-suite-note-list">
                {form.entryChecklist.map((item, index) => (
                  <div key={`check-${index}`} className="trader-suite-card-lite">
                    <strong>Checklist item {index + 1}</strong>
                    <input className="trader-suite-input" value={item} onChange={(e) => handleArrayChange('entryChecklist', index, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="trader-suite-field trader-suite-field--span-12">
              <label>Checklist rule</label>
              <textarea className="trader-suite-textarea" value={form.checklistNotes} onChange={(e) => handleChange('checklistNotes', e.target.value)} />
            </div>
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Risk And Management</div>
              <h2>How the trade is protected and managed</h2>
              <p>This is the operating section: invalidation, risk cap, sizing, partials, and how the trade is held.</p>
            </div>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Stop placement</label>
              <textarea className="trader-suite-textarea" value={form.stopPlacement} onChange={(e) => handleChange('stopPlacement', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Max risk %</label>
              <input className="trader-suite-input" value={form.maxRisk} onChange={(e) => handleChange('maxRisk', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Position sizing</label>
              <input className="trader-suite-input" value={form.positionSizing} onChange={(e) => handleChange('positionSizing', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Invalidation logic</label>
              <textarea className="trader-suite-textarea" value={form.invalidationLogic} onChange={(e) => handleChange('invalidationLogic', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Management rules</label>
              <textarea
                className="trader-suite-textarea"
                value={`${form.partialsRule}\n${form.trailingLogic}\n${form.holdVsExit}`}
                onChange={(e) => {
                  const [partialsRule = '', trailingLogic = '', holdVsExit = ''] = e.target.value.split('\n');
                  setForm((prev) => ({ ...prev, partialsRule, trailingLogic, holdVsExit }));
                }}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Hard Filters</div>
              <h2>Do not trade if</h2>
              <p>These conditions should block the trade entirely, even if the setup usually works.</p>
            </div>
          </div>
          <div className="trader-suite-note-list">
            {form.doNotTrade.map((item, index) => (
              <div key={`dont-${index}`} className="trader-suite-note">
                <strong>Blocker {index + 1}</strong>
                <input className="trader-suite-input" value={item} onChange={(e) => handleArrayChange('doNotTrade', index, e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Known Leaks</div>
              <h2>Recurring mistakes</h2>
              <p>Keep the mistakes visible so replay can diagnose whether the setup failed or the execution did.</p>
            </div>
          </div>
          <div className="trader-suite-note-list">
            {form.commonMistakes.map((item, index) => (
              <div key={`mistake-${index}`} className="trader-suite-note">
                <strong>Mistake {index + 1}</strong>
                <input className="trader-suite-input" value={item} onChange={(e) => handleArrayChange('commonMistakes', index, e.target.value)} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Performance Feedback</div>
            <h2>How this setup actually performs</h2>
            <p>The playbook stays alive only when review data flows back into it and sharpens the rules over time.</p>
          </div>
          <div className="trader-suite-cta-row">
            <Link to="/trader-lab" className="trader-suite-btn trader-suite-btn--primary">Use this setup in Trader Lab</Link>
            <Link to="/trader-replay" className="trader-suite-btn">Review this setup in Replay</Link>
          </div>
        </div>
        <div className="trader-suite-metric-grid">
          <div className="trader-suite-metric">
            <h3>Win rate</h3>
            <p>{form.winRate}</p>
          </div>
          <div className="trader-suite-metric">
            <h3>Average R</h3>
            <p>{form.avgR}</p>
          </div>
          <div className="trader-suite-metric">
            <h3>Best performance</h3>
            <p style={{ fontSize: '1rem' }}>{form.bestPerformance}</p>
          </div>
          <div className="trader-suite-metric">
            <h3>Worst performance</h3>
            <p style={{ fontSize: '1rem' }}>{form.worstPerformance}</p>
          </div>
        </div>
      </section>
    </TraderSuiteShell>
  );
}
