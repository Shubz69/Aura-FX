import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradingViewWidgetEmbed from '../components/TradingViewWidgetEmbed';
import Api from '../services/Api';
import { REPLAY_PATTERN_OPTIONS } from '../utils/traderSuite';

const DECISION_POINTS = [
  { id: 'zone', label: 'Valid entry zone', time: '08:35', note: 'Structure reclaimed and liquidity sweep completed.' },
  { id: 'confirm', label: 'Confirmation occurred here', time: '08:47', note: 'M5 close confirmed the reclaim with momentum.' },
  { id: 'late', label: 'Late entry risk', time: '08:56', note: 'Chasing after the impulse reduces reward-to-risk sharply.' },
  { id: 'invalid', label: 'Invalidation here', time: '09:12', note: 'Loss of reclaim low would have invalidated the thesis.' },
];

const DEFAULT_REPLAY = {
  title: 'EURUSD London Breakout Review',
  symbol: 'OANDA:EURUSD',
  interval: '15',
  asset: 'EURUSD',
  direction: 'Long',
  outcome: 'Win',
  rResult: '2.5R',
  entry: '1.2748',
  stop: '1.2729',
  target: '1.2796',
  exit: '1.2791',
  marketState: 'Trend continuation',
  biasAtTime: 'Bullish',
  confidenceLevel: '74%',
  keyDrivers: 'London low sweep, reclaim, and aligned Aura bias.',
  entryTiming: 7,
  discipline: 6,
  patience: 5,
  verdict: 'Good trade, but runner was managed too tightly.',
  mfe: '3.1R',
  mae: '0.4R',
  missedR: '0.7R',
  actualR: '2.5R',
  insight: 'Wait for the reclaim close and give the runner more room once 1R is secured.',
  patternInsight: REPLAY_PATTERN_OPTIONS[0],
  linkedPlaybook: 'London Breakout',
  linkedLabDate: '2026-04-01',
  replayStep: 1,
};

function normalizeReplay(session = {}) {
  return {
    ...DEFAULT_REPLAY,
    ...session,
  };
}

export default function TraderReplay() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_REPLAY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Api.getTraderReplaySessions()
      .then((res) => {
        if (!active) return;
        const next = Array.isArray(res?.data?.sessions) ? res.data.sessions.map(normalizeReplay) : [];
        if (next.length) {
          setSessions(next);
          setActiveId(next[0].id);
          setForm(next[0]);
        } else {
          setSessions([]);
          setActiveId(null);
          setForm(DEFAULT_REPLAY);
        }
      })
      .catch(() => {
        if (!active) return;
        setSessions([]);
        setActiveId(null);
        setForm(DEFAULT_REPLAY);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedDecision = useMemo(
    () => DECISION_POINTS[Math.max(0, Math.min(DECISION_POINTS.length - 1, form.replayStep))],
    [form.replayStep]
  );

  const stats = [
    { label: 'Replay symbol', value: form.asset, note: form.direction },
    { label: 'Outcome', value: form.outcome, note: form.rResult },
    { label: 'Bias at time', value: form.biasAtTime, note: form.confidenceLevel },
    { label: 'Verdict', value: `${form.entryTiming}/10`, note: 'Entry timing' },
  ];

  const saveReplay = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (activeId) {
        const res = await Api.updateTraderReplaySession(activeId, payload);
        const saved = normalizeReplay(res?.data?.session || { ...payload, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
      } else {
        const res = await Api.createTraderReplaySession(payload);
        const saved = normalizeReplay(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
      }
      toast.success('Replay saved');
    } catch (error) {
      console.error(error);
      toast.error('Could not save replay yet');
    } finally {
      setSaving(false);
    }
  };

  const changeStep = (delta) => {
    setForm((prev) => ({
      ...prev,
      replayStep: Math.max(0, Math.min(DECISION_POINTS.length - 1, prev.replayStep + delta)),
    }));
  };

  return (
    <TraderSuiteShell
      eyebrow="Trader Workflow / Step 3"
      title="Trader Replay"
      description="Review the trade as a sequence: load the case, see the market context, compare the plan against reality, score execution, then decide the one improvement that should feed the next cycle."
      stats={stats}
      status={{
        title: 'Replay is about the gap',
        body: 'Playbook defines the standard and Trader Lab captures the plan. Replay shows where execution matched it and where it drifted.',
      }}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveReplay} disabled={saving}>
          {saving ? 'Saving...' : 'Save replay'}
        </button>
      )}
      secondaryActions={(
        <>
          <Link to="/trader-lab" className="trader-suite-btn">Open linked Lab session</Link>
          <Link to="/trader-playbook" className="trader-suite-btn">Update Playbook from review</Link>
        </>
      )}
      workflowSteps={[
        { index: '1', label: 'Load case', note: 'Select the trade you are reviewing.', complete: true },
        { index: '2', label: 'Rebuild context', note: 'What the market looked like at the time.', complete: true },
        { index: '3', label: 'Planned vs actual', note: 'Compare the intended trade with what happened.', active: true },
        { index: '4', label: 'Score execution', note: 'Timing, patience, discipline, and opportunity.' },
        { index: '5', label: 'Carry forward', note: 'Turn the review into the next action.' },
      ]}
      railTitle="Review lens"
      railContent={(
        <div className="trader-suite-rail-stack">
          <div className="trader-suite-summary-card">
            <h3>{form.title}</h3>
            <p>{form.outcome} on {form.asset} with {form.rResult}. The key question is whether the result came from correct execution or avoidable deviation.</p>
          </div>
          <div className="trader-suite-card-lite">
            <strong>Improvement focus</strong>
            <p>{form.insight}</p>
          </div>
        </div>
      )}
    >
      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 1</div>
              <h2>Load the reviewed trade</h2>
              <p>Select the trade first, then replay it in sequence instead of scanning disconnected analysis blocks.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--good">Official TradingView widget</span>
          </div>
          <div className="trader-suite-tab-row">
            {sessions.slice(0, 4).map((session) => (
              <button
                key={session.id}
                type="button"
                className={`trader-suite-tab-btn${session.id === activeId ? ' trader-suite-tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveId(session.id);
                  setForm(normalizeReplay(session));
                }}
              >
                {session.title}
              </button>
            ))}
          </div>
          {loading ? <div className="trader-suite-empty">Loading replay sessions...</div> : null}
          <div className="trader-suite-field-grid" style={{ marginTop: 18 }}>
            <div className="trader-suite-field trader-suite-field--span-5">
              <label>Replay title</label>
              <input className="trader-suite-input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-4">
              <label>TradingView symbol</label>
              <input className="trader-suite-input" value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value }))} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
              <label>Interval</label>
              <select className="trader-suite-select" value={form.interval} onChange={(e) => setForm((prev) => ({ ...prev, interval: e.target.value }))}>
                <option value="5">5m</option>
                <option value="15">15m</option>
                <option value="60">1h</option>
                <option value="240">4h</option>
              </select>
            </div>
          </div>
          <div className="trader-suite-metric-grid" style={{ marginTop: 18 }}>
            <div className="trader-suite-metric">
              <h3>Pair / asset</h3>
              <p>{form.asset}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Direction</h3>
              <p>{form.direction}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Outcome</h3>
              <p>{form.outcome}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>R result</h3>
              <p>{form.rResult}</p>
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Step 2</div>
                <h2>Market context at the time</h2>
              </div>
            </div>
            <div className="trader-suite-note-list">
              <div className="trader-suite-note">
                <strong>Levels</strong>
                <p>Entry {form.entry} | Stop {form.stop} | Target {form.target} | Exit {form.exit}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Context</strong>
                <p>{form.marketState} | Bias {form.biasAtTime} | Confidence {form.confidenceLevel}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Key drivers</strong>
                <p>{form.keyDrivers}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 3</div>
              <h2>Planned setup vs actual execution</h2>
              <p>Keep the chart central, but make the review itself about whether the trade matched the intended plan.</p>
            </div>
          </div>
          <TradingViewWidgetEmbed symbol={form.symbol} interval={form.interval} studies={['STD;RSI']} />
          <div className="trader-suite-section-header" style={{ marginTop: 18, marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>Replay controls</h2>
              <p>Use the Aura controls to move through the decision timeline and check what changed from the original plan.</p>
            </div>
          </div>
          <div className="trader-suite-toolbar">
            <button type="button" className="trader-suite-btn" onClick={() => changeStep(-1)}>Step back</button>
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => changeStep(1)}>Step forward</button>
            <button type="button" className="trader-suite-btn" onClick={() => setForm((prev) => ({ ...prev, replayStep: 0 }))}>Restart</button>
            <span className="trader-suite-badge">{selectedDecision.time}</span>
          </div>
          <div className="trader-suite-grid trader-suite-grid--2" style={{ marginTop: 18 }}>
            <div className="trader-suite-note">
              <strong>Planned setup</strong>
              <p>{form.linkedPlaybook} with {form.biasAtTime.toLowerCase()} bias, confirmation, and defined invalidation.</p>
            </div>
            <div className="trader-suite-note">
              <strong>Actual execution</strong>
              <p>{form.verdict}</p>
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Decision timeline</div>
                <h2>Moments that mattered</h2>
              </div>
            </div>
            <div className="trader-suite-annotation-list">
              {DECISION_POINTS.map((point, index) => (
                <button
                  key={point.id}
                  type="button"
                  className="trader-suite-annotation"
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setForm((prev) => ({ ...prev, replayStep: index }))}
                >
                  <strong>{point.label}</strong>
                  <small>{point.time}</small>
                  <div className="trader-suite-copy">{point.note}</div>
                </button>
              ))}
            </div>
            <div className="trader-suite-annotation" style={{ marginTop: 12 }}>
              <strong>{selectedDecision.label}</strong>
              <small>{selectedDecision.time}</small>
              <div className="trader-suite-copy">{selectedDecision.note}</div>
            </div>
          </section>
        </aside>
      </div>

      <div className="trader-suite-split">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Step 4</div>
              <h2>Execution scoring</h2>
              <p>Score the trade as execution, not as outcome alone. Good PnL can still hide poor process.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--warn">{form.verdict}</span>
          </div>
          <div className="trader-suite-metric-grid">
            <div className="trader-suite-metric">
              <h3>Entry timing</h3>
              <p>{form.entryTiming}/10</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Discipline</h3>
              <p>{form.discipline}/10</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Patience</h3>
              <p>{form.patience}/10</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Verdict</h3>
              <p style={{ fontSize: '0.98rem' }}>{form.verdict}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>MFE</h3>
              <p>{form.mfe}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>MAE</h3>
              <p>{form.mae}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Missed R</h3>
              <p>{form.missedR}</p>
            </div>
            <div className="trader-suite-metric">
              <h3>Actual R</h3>
              <p>{form.actualR}</p>
            </div>
          </div>
        </section>

        <aside className="trader-suite-stacked-sections">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-section-header">
              <div>
                <div className="trader-suite-kicker">Step 5</div>
                <h2>Lesson and improvement output</h2>
              </div>
            </div>
            <div className="trader-suite-note-list">
              <div className="trader-suite-note">
                <strong>Primary insight</strong>
                <p>{form.insight}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Pattern tracking</strong>
                <p>{form.patternInsight}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Linked playbook</strong>
                <p>{form.linkedPlaybook}</p>
              </div>
              <div className="trader-suite-note">
                <strong>Linked lab session</strong>
                <p>{form.linkedLabDate}</p>
              </div>
            </div>
            <div className="trader-suite-cta-row" style={{ marginTop: 16 }}>
              <Link to="/trader-playbook" className="trader-suite-btn trader-suite-btn--primary">Update Playbook from this review</Link>
              <Link to="/trader-lab" className="trader-suite-btn">Carry insight into next Lab session</Link>
            </div>
          </section>
        </aside>
      </div>
    </TraderSuiteShell>
  );
}
