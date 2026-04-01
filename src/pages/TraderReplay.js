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
      eyebrow="Trader Desk / Replay"
      title="Trader Replay"
      description="Replay the trade against what actually happened: chart context, decision points, rule adherence, execution scoring, missed opportunity, and the lesson that should carry into the next session."
      stats={stats}
      highlight={{
        title: 'Replay checks reality against your rules',
        body: 'Playbook defines the standard. Replay shows what you actually did. The gap between the two is where performance improves.',
      }}
      actions={
        <>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveReplay} disabled={saving}>
            {saving ? 'Saving...' : 'Save replay'}
          </button>
          <Link to="/trader-lab" className="trader-suite-btn">Back to Trader Lab</Link>
          <Link to="/trader-playbook" className="trader-suite-btn">View Playbook</Link>
        </>
      }
    >
      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Chart Replay</div>
              <h2>TradingView market view</h2>
              <p>The official TradingView widget provides the live chart canvas while Aura handles replay context, annotations, and scoring around it.</p>
            </div>
            <span className="trader-suite-badge trader-suite-badge--good">Official TradingView widget</span>
          </div>
          <TradingViewWidgetEmbed symbol={form.symbol} interval={form.interval} studies={['STD;RSI']} />
          <div className="trader-suite-section-header" style={{ marginTop: 18, marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>Replay controls</h2>
              <p>Use the Aura controls to step through your decision points and evaluate timing.</p>
            </div>
          </div>
          <div className="trader-suite-toolbar">
            <button type="button" className="trader-suite-btn" onClick={() => changeStep(-1)}>Step back</button>
            <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => changeStep(1)}>Step forward</button>
            <button type="button" className="trader-suite-btn" onClick={() => setForm((prev) => ({ ...prev, replayStep: 0 }))}>Restart</button>
            <span className="trader-suite-badge">{selectedDecision.time}</span>
          </div>
          <div className="trader-suite-annotation" style={{ marginTop: 16 }}>
            <strong>{selectedDecision.label}</strong>
            <small>{selectedDecision.time}</small>
            <div className="trader-suite-copy">{selectedDecision.note}</div>
          </div>
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Trade Panel</div>
              <h2>Execution context</h2>
              <p>Every replay should explain what the market looked like, what the rulebook said, and how execution compared.</p>
            </div>
            <div className="trader-suite-toolbar">
              {sessions.slice(0, 4).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`trader-suite-btn${session.id === activeId ? ' trader-suite-btn--primary' : ''}`}
                  onClick={() => {
                    setActiveId(session.id);
                    setForm(normalizeReplay(session));
                  }}
                >
                  {session.title}
                </button>
              ))}
            </div>
          </div>
          {loading ? <div className="trader-suite-empty">Loading replay sessions...</div> : null}
          <div className="trader-suite-field-grid">
            <div className="trader-suite-field trader-suite-field--span-6">
              <label>Replay title</label>
              <input className="trader-suite-input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div className="trader-suite-field trader-suite-field--span-3">
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

          <div className="trader-suite-note-list" style={{ marginTop: 18 }}>
            <div className="trader-suite-note">
              <strong>Levels</strong>
              <p>Entry {form.entry} | Stop {form.stop} | Target {form.target} | Exit {form.exit}</p>
            </div>
            <div className="trader-suite-note">
              <strong>Context</strong>
              <p>{form.marketState} | Bias {form.biasAtTime} | Confidence {form.confidenceLevel} | {form.keyDrivers}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="trader-suite-grid trader-suite-grid--2">
        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Decision Points</div>
              <h2>Annotated review timeline</h2>
              <p>Show the moments that mattered so the replay teaches decisions, not just outcomes.</p>
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
        </section>

        <section className="trader-suite-panel trader-suite-section">
          <div className="trader-suite-section-header">
            <div>
              <div className="trader-suite-kicker">Execution Analysis</div>
              <h2>Scoring and metrics</h2>
              <p>Use replay to diagnose timing, discipline, patience, and what the trade left on the table.</p>
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
      </div>

      <section className="trader-suite-panel trader-suite-section">
        <div className="trader-suite-section-header">
          <div>
            <div className="trader-suite-kicker">Insight Panel</div>
            <h2>What should have been done?</h2>
            <p>Use the replay verdict to tie execution back into the playbook and forward into the next lab session.</p>
          </div>
          <div className="trader-suite-actions-row">
            <Link to="/trader-playbook" className="trader-suite-btn">Compare to Playbook</Link>
            <Link to="/trader-lab" className="trader-suite-btn trader-suite-btn--primary">Open linked Lab session</Link>
          </div>
        </div>
        <div className="trader-suite-grid trader-suite-grid--2">
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
      </section>
    </TraderSuiteShell>
  );
}
