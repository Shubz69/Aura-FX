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
      { label: 'Active setup', value: form.name, note: form.session },
      { label: 'Market type', value: form.marketType, note: form.timeframes },
      { label: 'Max risk', value: `${form.maxRisk}%`, note: 'Per idea' },
      { label: 'Average R', value: form.avgR, note: form.winRate },
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
      eyebrow="Trader Desk / Playbook"
      title="Trader Playbook"
      description="Build your operating manual with exact setup conditions, risk logic, management rules, and the checklist that Trader Lab can validate against in real time."
      stats={stats}
      highlight={{
        title: 'Rules become usable edge when they are structured',
        body: 'This page is designed as a living strategy system. The tighter the playbook, the stronger the validation, replay review, and behavior coaching become everywhere else in Aura.',
      }}
      actions={
        <>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSetup} disabled={saving}>
            {saving ? 'Saving...' : 'Save playbook'}
          </button>
          <button type="button" className="trader-suite-btn" onClick={createNewSetup}>
            New setup
          </button>
          <Link to="/trader-lab" className="trader-suite-btn">
            Open Trader Lab
          </Link>
        </>
      }
    >
      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Strategy Overview</div>
            <h2>Setup library</h2>
            <p>Choose a playbook, update it, or create a new one for a different setup family.</p>
          </div>
          <div className="trader-suite-toolbar">
            {setups.map((setup) => (
              <button
                key={setup.id}
                type="button"
                className={`trader-suite-btn${setup.id === activeId ? ' trader-suite-btn--primary' : ''}`}
                onClick={() => {
                  setActiveId(setup.id);
                  setForm(normalizeSetup(setup));
                }}
              >
                {setup.name}
              </button>
            ))}
          </div>
        </div>
        {loading ? <div className="trader-suite-empty">Loading your saved setups...</div> : null}
        <div className="trader-suite-field-grid">
          <div className="trader-suite-field trader-suite-field--span-4">
            <label>Strategy name</label>
            <input className="trader-suite-input" value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-2">
            <label>Market type</label>
            <select className="trader-suite-select" value={form.marketType} onChange={(e) => handleChange('marketType', e.target.value)}>
              <option value="trend">Trend</option>
              <option value="range">Range</option>
              <option value="mixed">Mixed</option>
              <option value="news">News-driven</option>
            </select>
          </div>
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Timeframes used</label>
            <input className="trader-suite-input" value={form.timeframes} onChange={(e) => handleChange('timeframes', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-3">
            <label>Pairs / assets</label>
            <input className="trader-suite-input" value={form.assets} onChange={(e) => handleChange('assets', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-4">
            <label>Session</label>
            <input className="trader-suite-input" value={form.session} onChange={(e) => handleChange('session', e.target.value)} />
          </div>
          <div className="trader-suite-field trader-suite-field--span-8">
            <label>Bias requirement</label>
            <textarea className="trader-suite-textarea" value={form.biasRequirement} onChange={(e) => handleChange('biasRequirement', e.target.value)} />
          </div>
        </div>
      </section>

      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Conditions</div>
              <h2>Setup conditions</h2>
              <p>Make the environment requirements explicit enough for the lab validator to check.</p>
            </div>
            <span className="trader-suite-badge">Playbook-linked validation</span>
          </div>
          <div className="trader-suite-field-grid">
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
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Confirmation type</label>
              <input className="trader-suite-input" value={form.confirmationType} onChange={(e) => handleChange('confirmationType', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Entry trigger</label>
              <input className="trader-suite-input" value={form.entryTrigger} onChange={(e) => handleChange('entryTrigger', e.target.value)} />
            </div>
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Execution Rules</div>
              <h2>Risk and management</h2>
              <p>These rules become the guardrails used in Trader Lab and the benchmark used in Replay.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--good">Rules-first execution</span>
          </div>
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Stop placement rules</label>
              <textarea className="trader-suite-textarea" value={form.stopPlacement} onChange={(e) => handleChange('stopPlacement', e.target.value)} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Max % risk</label>
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
              <label>Trade management</label>
              <textarea className="trader-suite-textarea" value={`${form.partialsRule}\n${form.trailingLogic}\n${form.holdVsExit}`} onChange={(e) => {
                const [partialsRule = '', trailingLogic = '', holdVsExit = ''] = e.target.value.split('\n');
                setForm((prev) => ({ ...prev, partialsRule, trailingLogic, holdVsExit }));
              }} />
            </div>
          </div>
        </section>
      </div>

      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Protection Layer</div>
              <h2>Do not trade if</h2>
              <p>Use hard filters so low-quality conditions are blocked before execution.</p>
            </div>
          </div>
          <div className="trader-suite-note-list">
            {form.doNotTrade.map((item, index) => (
              <div key={`dont-${index}`} className="trader-suite-note">
                <strong>Filter {index + 1}</strong>
                <input className="trader-suite-input" value={item} onChange={(e) => handleArrayChange('doNotTrade', index, e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Personal Leaks</div>
              <h2>Common mistakes and checklist</h2>
              <p>Keep the checklist actionable and the mistake list honest so replay can score against it later.</p>
            </div>
          </div>
          <div className="trader-suite-note-list">
            {form.commonMistakes.map((item, index) => (
              <div key={`mistake-${index}`} className="trader-suite-note">
                <strong>Mistake {index + 1}</strong>
                <input className="trader-suite-input" value={item} onChange={(e) => handleArrayChange('commonMistakes', index, e.target.value)} />
              </div>
            ))}
            <div className="trader-suite-note">
              <strong>Actionable checklist note</strong>
              <textarea className="trader-suite-textarea" value={form.checklistNotes} onChange={(e) => handleChange('checklistNotes', e.target.value)} />
            </div>
          </div>
        </section>
      </div>

      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Performance Lens</div>
            <h2>Performance stats</h2>
            <p>The playbook should stay alive. Track how this setup actually performs, not how you hope it performs.</p>
          </div>
          <Link to="/trader-replay" className="trader-suite-btn">Open Replay</Link>
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
