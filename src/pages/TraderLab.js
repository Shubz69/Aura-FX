import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradingViewWidgetEmbed from '../components/TradingViewWidgetEmbed';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow, getUserFirstName } from '../utils/welcomeUser';
import {
  MISTAKE_TAG_OPTIONS,
  PLAYBOOK_SETUP_OPTIONS,
  buildBehaviourSummary,
  buildValidator,
  calculateRiskAmount,
  calculatePositionSizeUnits,
  calculateRiskReward,
  safeNumber,
  toYmd,
} from '../utils/traderSuite';

const INSTRUMENTS = [
  { label: 'XAUUSD', value: 'OANDA:XAUUSD' },
  { label: 'EURUSD', value: 'OANDA:EURUSD' },
  { label: 'GBPUSD', value: 'OANDA:GBPUSD' },
  { label: 'USDJPY', value: 'OANDA:USDJPY' },
  { label: 'BTCUSD', value: 'COINBASE:BTCUSD' },
];

const CHART_INTERVALS = [
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: '1D' },
];

const DEFAULT_FORM = {
  sessionDate: toYmd(),
  chartSymbol: 'OANDA:XAUUSD',
  accountSize: 50000,
  marketBias: 'Bullish',
  marketState: 'Trending',
  auraConfidence: 72,
  todaysFocus: 'U.S./China|Neutral\nEurope|Positive\nMiddle East|Negative',
  sessionGoal: 'Hold discipline on continuation entries; max 2 quality trades.',
  maxTradesAllowed: 3,
  whatDoISee:
    '• Liquidity build above prior swing high\n• Dollar index rolling over intraday\n• Volatility expanding in NY session',
  setupName: 'Trend Pullback Continuation',
  whyValid:
    '• GDP prints stable vs expectations\n• Inflation trajectory cooling in core basket\n• Sector strength in metals and energy',
  entryConfirmation:
    'Plan: scale in after bullish rejection on 1H. Target prior liquidity high. Stop below structure. Review after London fix.',
  confidence: 72,
  riskLevel: 'Medium',
  entryPrice: 2235,
  stopLoss: 2218,
  targetPrice: 2265,
  riskPercent: 1,
  biasAligned: true,
  setupValid: true,
  entryConfirmed: true,
  riskDefined: true,
  livePnlR: 1.5,
  livePnlPercent: 0.8,
  currentPrice: 2236.4,
  distanceToSl: 18,
  distanceToTp: 29,
  emotions: 'Focused',
  duringNotes: '',
  outcome: 'win',
  resultR: 2.5,
  durationMinutes: 96,
  followedRules: true,
  entryCorrect: true,
  exitCorrect: false,
  whatToChange: '',
  emotionalIntensity: 30,
  mistakeTags: [],
};

function normalizeSession(session = {}) {
  return {
    ...DEFAULT_FORM,
    ...session,
    mistakeTags: Array.isArray(session.mistakeTags) ? session.mistakeTags : DEFAULT_FORM.mistakeTags,
    chartSymbol: session.chartSymbol || DEFAULT_FORM.chartSymbol,
    accountSize: session.accountSize !== '' && session.accountSize != null ? Number(session.accountSize) : DEFAULT_FORM.accountSize,
  };
}

function parseGeopoliticalBlock(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const pipe = line.indexOf('|');
    if (pipe === -1) return { region: line, sentiment: '—' };
    return {
      region: line.slice(0, pipe).trim(),
      sentiment: line.slice(pipe + 1).trim(),
    };
  });
}

function sentimentClass(s) {
  const x = String(s).toLowerCase();
  if (x.includes('positive') || x.includes('bull')) return 'tlab-sent--pos';
  if (x.includes('negative') || x.includes('bear')) return 'tlab-sent--neg';
  return 'tlab-sent--mid';
}

export default function TraderLab() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [playbookSetups, setPlaybookSetups] = useState(PLAYBOOK_SETUP_OPTIONS);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chartInterval, setChartInterval] = useState('60');
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([Api.getTraderLabSessions(), Api.getTraderPlaybookSetups()])
      .then(([sessionsRes, playbookRes]) => {
        if (!active) return;

        const nextSessions =
          sessionsRes.status === 'fulfilled' && Array.isArray(sessionsRes.value?.data?.sessions)
            ? sessionsRes.value.data.sessions.map(normalizeSession)
            : [];
        const nextSetups =
          playbookRes.status === 'fulfilled' && Array.isArray(playbookRes.value?.data?.setups)
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

  const riskAmount = useMemo(
    () => calculateRiskAmount(form.accountSize, form.riskPercent),
    [form.accountSize, form.riskPercent]
  );

  const positionUnits = useMemo(
    () => calculatePositionSizeUnits(form.accountSize, form.riskPercent, form.entryPrice, form.stopLoss),
    [form.accountSize, form.riskPercent, form.entryPrice, form.stopLoss]
  );

  const validator = useMemo(() => buildValidator(form), [form]);
  const behaviour = useMemo(() => buildBehaviourSummary(form), [form]);
  const rrOk = rr >= 1;

  const tradeValidatorRows = useMemo(
    () => [
      { label: 'Trend alignment', ok: form.biasAligned },
      { label: 'Risk / reward', ok: rrOk },
      { label: 'Setup valid', ok: form.setupValid },
      { label: 'Confirmation', ok: form.entryConfirmed },
    ],
    [form.biasAligned, form.setupValid, form.entryConfirmed, rrOk]
  );

  const validatorPanelOk = tradeValidatorRows.every((r) => r.ok);

  const stats = useMemo(
    () => [
      { label: 'Market State', value: form.marketState },
      { label: 'Confidence', value: `${form.auraConfidence}%` },
      { label: 'Bias', value: form.marketBias },
    ],
    [form.auraConfidence, form.marketBias, form.marketState]
  );

  const geoRows = useMemo(() => parseGeopoliticalBlock(form.todaysFocus), [form.todaysFocus]);

  const newsRiskLabel = form.emotionalIntensity >= 55 ? 'Moderate' : 'Low';
  const volLabel =
    form.riskLevel === 'High' ? 'High' : form.riskLevel === 'Low' ? 'Low' : 'Moderate';

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
        setLastSavedAt(new Date().toISOString());
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        setLastSavedAt(new Date().toISOString());
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
    setLastSavedAt(null);
  };

  const readyToExecute = validator.passed && rrOk;

  const welcomeEyebrow = (
    <span className="tlab-welcome">
      <span className="tlab-avatar" aria-hidden>
        {getUserFirstName(user).slice(0, 1).toUpperCase()}
      </span>
      <span>{formatWelcomeEyebrow(user)}</span>
    </span>
  );

  return (
    <TraderSuiteShell
      variant="terminal"
      eyebrow={welcomeEyebrow}
      title="AURA TERMINAL — TRADER LAB"
      description={null}
      stats={stats}
      primaryAction={
        <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSession} disabled={saving}>
          {saving ? 'Saving...' : 'Save lab'}
        </button>
      }
      secondaryActions={
        <>
          <button type="button" className="trader-suite-btn" onClick={createFreshSession}>
            New session
          </button>
          <Link to="/trader-deck/trade-validator/trader-playbook" className="trader-suite-btn">
            Playbook
          </Link>
          <Link to="/aura-analysis/dashboard/trader-replay" className="trader-suite-btn">
            Replay
          </Link>
        </>
      }
    >
      {loading ? <div className="trader-suite-empty">Loading lab sessions...</div> : null}

      {!loading ? (
        <div className="trader-lab-v2">
          {/* Left column */}
          <aside className="trader-lab-v2__left">
            <div className="tlab-card">
              <h3 className="tlab-card__title">Market context</h3>
              <div className="tlab-field" style={{ marginBottom: 8 }}>
                <label>Bias</label>
                <select className="tlab-select" value={form.marketBias} onChange={(e) => updateField('marketBias', e.target.value)}>
                  {['Bullish', 'Bearish', 'Neutral'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="tlab-mc-row">
                <span>Confidence</span>
                <strong>{form.auraConfidence}%</strong>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                className="tlab-range"
                value={form.auraConfidence}
                onChange={(e) => updateField('auraConfidence', safeNumber(e.target.value))}
                aria-label="Aura confidence"
              />
              <div className="tlab-progress">
                <span style={{ width: `${safeNumber(form.auraConfidence, 0)}%` }} />
              </div>
              <div className="tlab-field" style={{ marginTop: 10 }}>
                <label>Market state</label>
                <select className="tlab-select" value={form.marketState} onChange={(e) => updateField('marketState', e.target.value)}>
                  {['Trending', 'Ranging', 'Volatile', 'Quiet'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="tlab-card__sub">Key drivers</div>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.whatDoISee}
                onChange={(e) => updateField('whatDoISee', e.target.value)}
                placeholder="One bullet per line (what you see)..."
                aria-label="Key drivers"
              />
            </div>

            <div className="tlab-card">
              <h3 className="tlab-card__title">Fundamental backing</h3>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.whyValid}
                onChange={(e) => updateField('whyValid', e.target.value)}
                placeholder="One bullet per line..."
                aria-label="Fundamental backing"
              />
            </div>

            <div className="tlab-card">
              <h3 className="tlab-card__title">Geopolitical backing</h3>
              <p className="tlab-hint">Region | Sentiment (one per line)</p>
              <div className="tlab-table-wrap">
                <table className="tlab-table">
                  <thead>
                    <tr>
                      <th>Region</th>
                      <th>Sentiment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoRows.map((row) => (
                      <tr key={row.region}>
                        <td>{row.region}</td>
                        <td><span className={sentimentClass(row.sentiment)}>{row.sentiment}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.todaysFocus}
                onChange={(e) => updateField('todaysFocus', e.target.value)}
                aria-label="Geopolitical backing"
              />
            </div>

            <div className="tlab-card">
              <h3 className="tlab-card__title">Risk radar</h3>
              <table className="tlab-table tlab-table--compact">
                <tbody>
                  <tr>
                    <td>Volatility</td>
                    <td><span className="tlab-pill tlab-pill--warn">{volLabel}</span></td>
                  </tr>
                  <tr>
                    <td>News risk</td>
                    <td><span className="tlab-pill tlab-pill--ok">{newsRiskLabel}</span></td>
                  </tr>
                  <tr>
                    <td>Session risk</td>
                    <td><span className="tlab-pill">{form.riskLevel}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </aside>

          {/* Center */}
          <div className="trader-lab-v2__center">
            <div className="tlab-card tlab-card--chart">
              <div className="tlab-chart-toolbar">
                <div className="tlab-session-tabs">
                  {sessions.slice(0, 6).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`tlab-session-tab${session.id === activeId ? ' tlab-session-tab--active' : ''}`}
                      onClick={() => {
                        setActiveId(session.id);
                        setForm(normalizeSession(session));
                      }}
                    >
                      {session.sessionDate}
                    </button>
                  ))}
                </div>
                <span className={`tlab-valid-chip${validator.passed && rrOk ? ' tlab-valid-chip--ok' : ' tlab-valid-chip--bad'}`}>
                  {validator.passed && rrOk ? 'Valid trade' : 'Blocked'}
                </span>
              </div>
              <div className="tlab-chart-toolbar tlab-chart-toolbar--second">
                <select
                  className="tlab-select"
                  value={form.chartSymbol}
                  onChange={(e) => updateField('chartSymbol', e.target.value)}
                  aria-label="Instrument"
                >
                  {INSTRUMENTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="tlab-tf-group" role="group" aria-label="Timeframe">
                  {CHART_INTERVALS.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      className={`tlab-tf${chartInterval === tf.value ? ' tlab-tf--active' : ''}`}
                      onClick={() => setChartInterval(tf.value)}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tlab-chart-host">
                <TradingViewWidgetEmbed symbol={form.chartSymbol} interval={chartInterval} height={480} studies={[]} />
              </div>
              <div className="tlab-level-strip">
                <div>
                  <span className="tlab-level-label">Entry</span>
                  <strong>{form.entryPrice}</strong>
                </div>
                <div>
                  <span className="tlab-level-label tlab-level-label--sl">Stop loss</span>
                  <strong>{form.stopLoss}</strong>
                </div>
                <div>
                  <span className="tlab-level-label tlab-level-label--tp">Target</span>
                  <strong>{form.targetPrice}</strong>
                </div>
              </div>
            </div>

            <div className="tlab-card">
              <div className="tlab-exec-head">
                <h3 className="tlab-card__title">Execution notes</h3>
                <span className="tlab-exec-meta">
                  Last updated:{' '}
                  {lastSavedAt
                    ? new Date(lastSavedAt).toLocaleString()
                    : '—'}
                </span>
              </div>
              <textarea
                className="tlab-textarea tlab-textarea--exec"
                value={form.entryConfirmation}
                onChange={(e) => updateField('entryConfirmation', e.target.value)}
                placeholder="Plan, invalidation, and execution notes..."
              />
              <div className="tlab-exec-actions">
                <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={saveSession} disabled={saving}>
                  Save notes
                </button>
              </div>
            </div>
          </div>

          {/* Right */}
          <aside className="trader-lab-v2__right">
            <div className="tlab-card">
              <h3 className="tlab-card__title">Trade plan builder</h3>
              <div className="tlab-field">
                <label>Instrument</label>
                <select className="tlab-select" value={form.chartSymbol} onChange={(e) => updateField('chartSymbol', e.target.value)}>
                  {INSTRUMENTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="tlab-field-grid">
                <div className="tlab-field">
                  <label>Entry</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.entryPrice}
                    onChange={(e) => updateField('entryPrice', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Stop loss</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.stopLoss}
                    onChange={(e) => updateField('stopLoss', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Target</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="any"
                    value={form.targetPrice}
                    onChange={(e) => updateField('targetPrice', e.target.value)}
                  />
                </div>
                <div className="tlab-field">
                  <label>Risk %</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="0.1"
                    value={form.riskPercent}
                    onChange={(e) => updateField('riskPercent', e.target.value)}
                  />
                </div>
                <div className="tlab-field tlab-field--span">
                  <label>Account size</label>
                  <input
                    className="tlab-input"
                    type="number"
                    step="100"
                    value={form.accountSize}
                    onChange={(e) => updateField('accountSize', e.target.value)}
                  />
                </div>
                <div className="tlab-field tlab-field--span">
                  <label>Playbook setup</label>
                  <select className="tlab-select" value={form.setupName} onChange={(e) => updateField('setupName', e.target.value)}>
                    {playbookSetups.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="tlab-rr-big">
                <span className="tlab-rr-label">R∶R ratio</span>
                <span className="tlab-rr-value">1 ∶ {Number.isFinite(rr) && rr > 0 ? rr.toFixed(2) : '—'}</span>
              </div>
              <div className="tlab-metric-row">
                <span>Risk amount</span>
                <strong>
                  {riskAmount > 0
                    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(riskAmount)
                    : '—'}
                </strong>
              </div>
              <div className="tlab-metric-row">
                <span>Position size (approx.)</span>
                <strong>{positionUnits > 0 ? positionUnits.toFixed(4) : '—'}</strong>
              </div>
            </div>

            <div className={`tlab-card tlab-card--validator${validatorPanelOk ? ' tlab-card--validator-pass' : ''}`}>
              <div className="tlab-validator-banner">{validatorPanelOk ? '✓ TRADE VALID' : 'CHECKLIST'}</div>
              <ul className="tlab-validator-list">
                {tradeValidatorRows.map((row) => (
                  <li key={row.label}>
                    <span className={row.ok ? 'tlab-check tlab-check--ok' : 'tlab-check tlab-check--no'}>{row.ok ? '✓' : '○'}</span>
                    {row.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="tlab-card">
              <h3 className="tlab-card__title">Behaviour pre-check</h3>
              <div className="tlab-beh-row">
                <span>Discipline</span>
                <strong>{behaviour.disciplineOutOf10.toFixed(1)} / 10</strong>
              </div>
              <div className="tlab-bar">
                <span style={{ width: `${behaviour.discipline}%` }} />
              </div>
              <div className="tlab-beh-row">
                <span>Patience</span>
                <strong>{behaviour.patienceOutOf10.toFixed(1)} / 10</strong>
              </div>
              <div className="tlab-bar tlab-bar--amber">
                <span style={{ width: `${behaviour.emotionalControl}%` }} />
              </div>
            </div>

            <div className="tlab-card tlab-card--muted">
              <h3 className="tlab-card__title">Session goal</h3>
              <textarea className="tlab-textarea tlab-textarea--tight" value={form.sessionGoal} onChange={(e) => updateField('sessionGoal', e.target.value)} />
              <h3 className="tlab-card__title" style={{ marginTop: 12 }}>Mistake tags</h3>
              <div className="trader-suite-tag-row">
                {MISTAKE_TAG_OPTIONS.map((tag) => (
                  <label key={tag} className="trader-suite-tag">
                    <input type="checkbox" checked={form.mistakeTags.includes(tag)} onChange={() => toggleMistakeTag(tag)} />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* Bottom bar */}
          <footer className="trader-lab-v2__footer">
            <div className="tlab-footer-checks">
              {[
                ['Bias aligned', 'biasAligned'],
                ['Setup valid', 'setupValid'],
                ['Confirmation', 'entryConfirmed'],
                ['Risk defined', 'riskDefined'],
              ].map(([label, key]) => (
                <label key={key} className="tlab-footer-check">
                  <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => updateField(key, e.target.checked)} />
                  <span className={form[key] ? 'tlab-fc-icon tlab-fc-icon--ok' : 'tlab-fc-icon'}>{form[key] ? '✓' : ''}</span>
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {key === 'biasAligned' && 'Direction matches your read'}
                      {key === 'setupValid' && 'Playbook criteria met'}
                      {key === 'entryConfirmed' && 'Trigger and timeframe agree'}
                      {key === 'riskDefined' && 'Stop and size defined'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="tlab-footer-cta">
              <button
                type="button"
                className="tlab-btn-execute"
                disabled={!readyToExecute}
                onClick={() => {
                  saveSession();
                  toast.success('Ready to execute — lab saved.');
                }}
              >
                <span className="tlab-btn-execute__ring">✓</span>
                Ready to execute
              </button>
            </div>
            <p className="tlab-tagline">Trade with clarity. Execute with precision. Win with discipline.</p>
          </footer>
        </div>
      ) : null}
    </TraderSuiteShell>
  );
}
