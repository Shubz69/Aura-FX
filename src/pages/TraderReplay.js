import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradingViewWidgetEmbed from '../components/TradingViewWidgetEmbed';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
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
  const { user } = useAuth();
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
      variant="terminal"
      eyebrow={formatWelcomeEyebrow(user)}
      title="TRADE REPLAY"
      description="Terminal-style replay layout with a dominant chart area, left replay controls, a dense trade-info rail, and a bottom insight panel."
      stats={stats}
      primaryAction={(
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveReplay} disabled={saving}>
          {saving ? 'Saving...' : 'Save replay'}
        </button>
      )}
      secondaryActions={(
        <>
          <Link to="/trader-deck/trade-validator/trader-lab" className="trader-suite-btn">Open linked Lab session</Link>
          <Link to="/trader-deck/trade-validator/trader-playbook" className="trader-suite-btn">Update Playbook from review</Link>
        </>
      )}
    >
      {loading ? <div className="trader-suite-empty">Loading replay sessions...</div> : null}
      <div className="trader-replay-terminal">
        <aside className="trader-replay-terminal__nav">
          <button type="button" className="trader-replay-terminal__nav-btn">Menu</button>
          <button type="button" className="trader-replay-terminal__nav-btn">Home</button>
          <button type="button" className="trader-replay-terminal__nav-btn">Desk</button>
          <button type="button" className="trader-replay-terminal__nav-btn trader-replay-terminal__nav-btn--active">Replay</button>
        </aside>

        <div className="trader-replay-terminal__main">
          <section className="trader-suite-panel trader-replay-terminal__chart">
            <div className="trader-replay-terminal__chart-toolbar">
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
            </div>

            <TradingViewWidgetEmbed symbol={form.symbol} interval={form.interval} studies={['STD;RSI']} height={430} />

            <div className="trader-replay-terminal__controls">
              <div className="trader-replay-terminal__transport">
                <button type="button" className="trader-suite-btn" onClick={() => setForm((prev) => ({ ...prev, replayStep: 0 }))}>Restart</button>
                <button type="button" className="trader-suite-btn" onClick={() => changeStep(-1)}>Back</button>
                <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => changeStep(1)}>Play</button>
                <button type="button" className="trader-suite-btn" onClick={() => changeStep(1)}>Step</button>
              </div>
              <div className="trader-replay-terminal__speed">
                <span className="trader-suite-muted">Speed:</span>
                <select className="trader-suite-select" value={form.interval} onChange={(e) => setForm((prev) => ({ ...prev, interval: e.target.value }))}>
                  <option value="5">1x</option>
                  <option value="15">2x</option>
                  <option value="60">4x</option>
                </select>
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-replay-terminal__insight">
            <div className="trader-suite-kicker">Insight</div>
            <div className="trader-suite-note">
              <strong>{selectedDecision.label}</strong>
              <p>{form.insight}</p>
            </div>
          </section>
        </div>

        <aside className="trader-replay-terminal__rail">
          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Trade Info</div>
            <div className="trader-suite-note-list">
              <div className="trader-suite-card-lite">
                <strong>{form.asset} | {form.direction} | {form.rResult}</strong>
                <p>Entry: {form.entry} | Stop: {form.stop} | Target: {form.target}</p>
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Execution Score</div>
            <div className="trader-replay-terminal__score-list">
              <div className="trader-replay-terminal__score-row"><span>Entry</span><strong>{form.entryTiming} / 10</strong></div>
              <div className="trader-replay-terminal__score-row"><span>Discipline</span><strong>{form.discipline} / 10</strong></div>
              <div className="trader-replay-terminal__score-row"><span>Timing</span><strong>{form.patience} / 10</strong></div>
              <div className="trader-replay-terminal__score-outcome">
                <span>Outcome</span>
                <strong>{form.verdict}</strong>
              </div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Market Context</div>
            <div className="trader-replay-terminal__score-list">
              <div className="trader-replay-terminal__score-row"><span>Trend</span><strong>{form.marketState}</strong></div>
              <div className="trader-replay-terminal__score-row"><span>Confidence</span><strong>{form.confidenceLevel}</strong></div>
            </div>
          </section>

          <section className="trader-suite-panel trader-suite-section trader-suite-section--compact">
            <div className="trader-suite-kicker">Performance</div>
            <div className="trader-replay-terminal__score-list">
              <div className="trader-replay-terminal__score-row"><span>MFE</span><strong>{form.mfe}</strong></div>
              <div className="trader-replay-terminal__score-row"><span>MAE</span><strong>{form.mae}</strong></div>
              <div className="trader-replay-terminal__score-row"><span>Missed R</span><strong>{form.missedR}</strong></div>
            </div>
          </section>
        </aside>
      </div>
    </TraderSuiteShell>
  );
}
