import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
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
  const { user } = useAuth();
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
      variant="terminal"
      eyebrow={formatWelcomeEyebrow(user)}
      title="AURA TERMINAL - TRADER PLAYBOOK"
      description="Compact terminal-board layout for your strategy rules. The setup should be readable in one screen with clear conditions, entry logic, management, checklist, and hard blockers."
      stats={stats}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSetup} disabled={saving}>
          {saving ? 'Saving...' : 'Save playbook'}
        </button>
      )}
      secondaryActions={(
        <>
          <button type="button" className="trader-suite-btn" onClick={createNewSetup}>New setup</button>
          <Link to="/trader-deck/trade-validator/trader-lab" className="trader-suite-btn">Use this setup in Trader Lab</Link>
          <Link to="/aura-analysis/dashboard/trader-replay" className="trader-suite-btn">View linked Replay</Link>
        </>
      )}
    >
      {loading ? <div className="trader-suite-empty">Loading your saved setups...</div> : null}

      <div className="trader-playbook-terminal">
        <div className="trader-playbook-terminal__board">
          <div className="trader-playbook-terminal__col">
            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Strategy Overview</div>
              <div className="trader-playbook-terminal__rows">
                <div className="trader-playbook-terminal__row"><span>Strategy Name</span><strong>{form.name}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Market Type</span><strong>{form.marketType}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Timeframes</span><strong>{form.timeframes}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Assets</span><strong>{form.assets}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Session</span><strong>{form.session}</strong></div>
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Best Conditions</div>
              <div className="trader-playbook-terminal__rows">
                <div className="trader-playbook-terminal__row"><span>Trend Phase</span><strong>{form.marketType}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Volatility</span><strong>{form.volatilityCondition}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Breakout Zone</span><strong>{form.structureRequirement}</strong></div>
                <div className="trader-playbook-terminal__row"><span>News</span><strong>{form.sessionTiming}</strong></div>
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Entry Rules</div>
              <div className="trader-playbook-terminal__numbered">
                {form.entryChecklist.slice(0, 3).map((item, index) => (
                  <div key={item} className="trader-playbook-terminal__numbered-row">
                    <span>{index + 1}</span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="trader-playbook-terminal__col trader-playbook-terminal__col--wide">
            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-section-header">
                <div className="trader-suite-kicker">Setup Conditions</div>
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
              </div>
              <div className="trader-playbook-terminal__checkrows">
                <div className="trader-playbook-terminal__checkrow"><span>Bias aligned</span><strong>{form.biasRequirement}</strong></div>
                <div className="trader-playbook-terminal__checkrow"><span>Volatility present</span><strong>{form.volatilityCondition}</strong></div>
                <div className="trader-playbook-terminal__checkrow"><span>Session active</span><strong>{form.sessionTiming}</strong></div>
                <div className="trader-playbook-terminal__checkrow"><span>Structure clear</span><strong>{form.structureRequirement}</strong></div>
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Entry Rules</div>
              <div className="trader-playbook-terminal__numbered">
                {[form.confirmationType, form.entryTrigger, form.checklistNotes].map((item, index) => (
                  <div key={`${index}-${item}`} className="trader-playbook-terminal__numbered-row">
                    <span>{index + 1}</span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Risk &amp; Trade Management</div>
              <div className="trader-playbook-terminal__numbered">
                {[form.stopPlacement, `Position Size: ${form.maxRisk}% risk per trade`, `${form.partialsRule} ${form.trailingLogic}`, form.holdVsExit].map((item, index) => (
                  <div key={`${index}-${item}`} className="trader-playbook-terminal__numbered-row">
                    <span>{index + 1}</span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="trader-playbook-terminal__col">
            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Playbook Checklist</div>
              <div className="trader-playbook-terminal__checkrows">
                {form.entryChecklist.map((item) => (
                  <div key={item} className="trader-playbook-terminal__checkrow">
                    <span>{item}</span>
                    <strong>Ready</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Common Mistakes</div>
              <div className="trader-suite-pill-row">
                {form.commonMistakes.map((item) => (
                  <span key={item} className="trader-suite-pill">{item}</span>
                ))}
              </div>
            </section>

            <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
              <div className="trader-suite-kicker">Performance Stats</div>
              <div className="trader-playbook-terminal__rows">
                <div className="trader-playbook-terminal__row"><span>Win Rate</span><strong>{form.winRate}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Best Setup</span><strong>{form.name}</strong></div>
                <div className="trader-playbook-terminal__row"><span>Discipline Score</span><strong>{form.avgR}</strong></div>
              </div>
            </section>
          </div>
        </div>

        <section className="trader-suite-panel trader-playbook-terminal__footer">
          <div className="trader-playbook-terminal__footer-title">DO NOT TRADE IF:</div>
          <div className="trader-playbook-terminal__footer-pills">
            {form.doNotTrade.map((item) => (
              <span key={item} className="trader-suite-pill">{item}</span>
            ))}
          </div>
        </section>
      </div>
    </TraderSuiteShell>
  );
}
