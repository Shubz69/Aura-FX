import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow, getUserFirstName } from '../utils/welcomeUser';
import { FaPlay } from 'react-icons/fa';
import { TRADER_LAB_HANDOFF_KEY, MARKET_DECODER_LAB_HANDOFF_KEY } from '../lib/aura-analysis/validator/validatorChecklistStorage';
import {
  PLAYBOOK_SETUP_OPTIONS,
  buildBehaviourSummary,
  buildValidator,
  buildTraderLabHandoff,
  buildLabFormPatchFromMarketDecoderBrief,
  chartSymbolToPair,
  clamp,
  calculateRiskAmount,
  calculatePositionSizeUnits,
  calculateRiskReward,
  confidenceToConviction,
  convictionToConfidence,
  formatPositionLots,
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
  accountSize: 100000,
  marketBias: 'Bullish',
  marketState: 'Trending',
  auraConfidence: 72,
  todaysFocus: 'U.S. / China|Neutral\nEurope|Positive\nMiddle East|Negative',
  sessionGoal: 'Hold discipline on continuation entries; max 2 quality trades.',
  maxTradesAllowed: 3,
  /** Trade thesis (also persisted via whatDoISee / whyValid / entryConfirmation columns) */
  whatDoISee: '',
  setupName: 'London Breakout',
  whyValid: '',
  entryConfirmation: '',
  conviction: 'medium',
  confidence: 65,
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
  const merged = {
    ...DEFAULT_FORM,
    ...session,
    mistakeTags: Array.isArray(session.mistakeTags) ? session.mistakeTags : DEFAULT_FORM.mistakeTags,
    chartSymbol: session.chartSymbol || DEFAULT_FORM.chartSymbol,
    accountSize: session.accountSize !== '' && session.accountSize != null ? Number(session.accountSize) : DEFAULT_FORM.accountSize,
  };
  if (!session.conviction && session.confidence != null) {
    merged.conviction = confidenceToConviction(session.confidence);
  }
  merged.confidence = convictionToConfidence(merged.conviction);
  merged.auraConfidence = merged.confidence;
  return merged;
}

function priceSliderBounds(entry) {
  const e = safeNumber(entry, 0);
  if (!e) return { min: 0, max: 1, step: 0.0001 };
  const span = Math.max(Math.abs(e) * 0.12, 0.0005);
  const step =
    Math.abs(e) >= 1000 ? 0.1 : Math.abs(e) >= 10 ? 0.0001 : 0.00001;
  return { min: e - span, max: e + span, step };
}

export default function TraderLab() {
  const navigate = useNavigate();
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

    (async () => {
      let loadedFromDecoder = false;
      try {
        const raw = sessionStorage.getItem(MARKET_DECODER_LAB_HANDOFF_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          sessionStorage.removeItem(MARKET_DECODER_LAB_HANDOFF_KEY);
          if (data?.brief && active) {
            const patch = buildLabFormPatchFromMarketDecoderBrief(data.brief);
            const merged = normalizeSession({ ...DEFAULT_FORM, ...patch, sessionDate: toYmd() });
            setActiveId(null);
            setForm(merged);
            setLastSavedAt(null);
            loadedFromDecoder = true;
            toast.success('Market Decoder context loaded — refine your plan, then EXECUTE to the checklist.');
          }
        }
      } catch (e) {
        console.warn(e);
      }

      if (!active) return;

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
            if (!loadedFromDecoder) {
              setActiveId(nextSessions[0].id);
              setForm(nextSessions[0]);
            }
          }

          if (nextSetups.length) {
            setPlaybookSetups(nextSetups);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    })();

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

  const positionLotsLabel = useMemo(
    () => formatPositionLots(form.chartSymbol, positionUnits),
    [form.chartSymbol, positionUnits]
  );

  const validator = useMemo(() => buildValidator(form), [form]);
  const rrOk = rr >= 1;

  const stats = useMemo(
    () => [
      { label: 'Market State', value: form.marketState || '—', tone: 'gold' },
      { label: 'Confidence', value: `${form.auraConfidence}%` },
      {
        label: 'Bias',
        value: form.marketBias,
        tone: /bull/i.test(String(form.marketBias || '')) ? 'green' : undefined,
      },
    ],
    [form.auraConfidence, form.marketBias, form.marketState]
  );

  const updateField = (key, value) => {
    if (key === 'conviction') {
      const conf = convictionToConfidence(value);
      setForm((prev) => ({
        ...prev,
        conviction: value,
        confidence: conf,
        auraConfidence: conf,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const entryBounds = useMemo(() => priceSliderBounds(form.entryPrice), [form.entryPrice]);

  const instrumentOptions = useMemo(() => {
    const base = [...INSTRUMENTS];
    if (form.chartSymbol && !base.some((o) => o.value === form.chartSymbol)) {
      base.unshift({ label: chartSymbolToPair(form.chartSymbol), value: form.chartSymbol });
    }
    return base;
  }, [form.chartSymbol]);

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

  const handleExecute = async () => {
    if (!readyToExecute) {
      toast.warning('Complete the Decision Engine (all checks) and ensure reward:risk is at least 1:1.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, rrRatio: rr };
      let nextId = activeId;
      if (activeId) {
        const res = await Api.updateTraderLabSession(activeId, payload);
        const saved = normalizeSession(res?.data?.session || { ...payload, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
        nextId = saved.id;
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        nextId = saved.id;
      }
      setLastSavedAt(new Date().toISOString());
      const handoff = buildTraderLabHandoff({ ...form, ...payload }, rr, nextId);
      try {
        sessionStorage.setItem(TRADER_LAB_HANDOFF_KEY, JSON.stringify(handoff));
      } catch (e) {
        console.warn(e);
      }
      toast.success('Saved. Next: Trade Validator checklist → Trade Calculator.');
      navigate('/trader-deck/trade-validator/checklist', { state: { fromTraderLab: true } });
    } catch (error) {
      console.error(error);
      toast.error('Could not save your plan.');
    } finally {
      setSaving(false);
    }
  };

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
      terminalSubtitle="Focus. Execute. Profit."
      terminalTitlePrefix={
        <svg className="trader-suite-terminal-logo" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <path fill="currentColor" d="M12 2 22 20H2z" />
        </svg>
      }
      title="AURA TERMINAL — TRADER LAB"
      description={null}
      stats={stats}
      primaryAction={null}
      secondaryActions={null}
    >
      {loading ? <div className="trader-suite-empty">Loading lab sessions...</div> : null}

      {!loading ? (
        <div className="trader-lab-v2 trader-lab-v2--gold trader-lab-v2--compact">
          <aside className="trader-lab-v2__left">
            <div className="tlab-card tlab-card--gold tlab-card--thesis">
              <h3 className="tlab-card__title tlab-thesis-title">
                <FaPlay className="tlab-thesis-play" aria-hidden />
                Trade Thesis
              </h3>
              <div className="tlab-thesis-fields">
                <div className="tlab-field">
                  <label htmlFor="tlab-thesis-why">Why this trade?</label>
                  <textarea
                    id="tlab-thesis-why"
                    className="tlab-textarea tlab-textarea--thesis"
                    value={form.whatDoISee}
                    onChange={(e) => updateField('whatDoISee', e.target.value)}
                    placeholder="Your narrative..."
                    rows={4}
                  />
                </div>
                <div className="tlab-field">
                  <label htmlFor="tlab-thesis-confirm">What confirms it?</label>
                  <textarea
                    id="tlab-thesis-confirm"
                    className="tlab-textarea tlab-textarea--thesis"
                    value={form.whyValid}
                    onChange={(e) => updateField('whyValid', e.target.value)}
                    placeholder="Signals, structure, confluence..."
                    rows={4}
                  />
                </div>
                <div className="tlab-field">
                  <label htmlFor="tlab-thesis-invalidate">What invalidates it?</label>
                  <textarea
                    id="tlab-thesis-invalidate"
                    className="tlab-textarea tlab-textarea--thesis"
                    value={form.entryConfirmation}
                    onChange={(e) => updateField('entryConfirmation', e.target.value)}
                    placeholder="Levels or conditions that void the idea..."
                    rows={4}
                  />
                </div>
              </div>
            </div>
          </aside>

          <div className="trader-lab-v2__center">
            <div className="tlab-card tlab-card--chart tlab-card--gold">
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
                <button type="button" className="tlab-toolbar-save" onClick={saveSession} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="tlab-toolbar-ghost" onClick={createFreshSession}>
                  New session
                </button>
              </div>
              <div className="tlab-chart-toolbar tlab-chart-toolbar--second">
                <select
                  className="tlab-select"
                  value={form.chartSymbol}
                  onChange={(e) => updateField('chartSymbol', e.target.value)}
                  aria-label="Instrument"
                >
                  {instrumentOptions.map((opt) => (
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
              <div className="tlab-chart-host tlab-chart-host--placeholder">
                <div className="tlab-chart-placeholder" aria-label="Chart preview (TradingView embed coming soon)">
                  <span className="tlab-chart-placeholder__badge">Chart</span>
                  <p className="tlab-chart-placeholder__hint">TradingView widget will load here</p>
                  <div className="tlab-chart-placeholder__mockline" aria-hidden />
                </div>
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
          </div>

          <aside className="trader-lab-v2__right">
            <div className="tlab-card tlab-card--gold tlab-card--builder">
              <h3 className="tlab-card__title">Trade Builder</h3>
              <div className="tlab-field">
                <label>Instrument</label>
                <select className="tlab-select" value={form.chartSymbol} onChange={(e) => updateField('chartSymbol', e.target.value)}>
                  {instrumentOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="tlab-builder-slider-block">
                <div className="tlab-builder-row">
                  <div className="tlab-builder-row-head">
                    <label htmlFor="tlab-entry-num">Entry</label>
                    <input
                      id="tlab-entry-num"
                      className="tlab-input tlab-input--inline"
                      type="number"
                      step={entryBounds.step}
                      value={form.entryPrice}
                      onChange={(e) => updateField('entryPrice', e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    className="tlab-range tlab-range--blue"
                    min={entryBounds.min}
                    max={entryBounds.max}
                    step={entryBounds.step}
                    value={clamp(safeNumber(form.entryPrice), entryBounds.min, entryBounds.max)}
                    onChange={(e) =>
                      updateField('entryPrice', clamp(safeNumber(e.target.value), entryBounds.min, entryBounds.max))
                    }
                    aria-label="Entry price"
                  />
                </div>
                <div className="tlab-builder-row">
                  <div className="tlab-builder-row-head">
                    <label htmlFor="tlab-stop-num">Stop</label>
                    <input
                      id="tlab-stop-num"
                      className="tlab-input tlab-input--inline"
                      type="number"
                      step={entryBounds.step}
                      value={form.stopLoss}
                      onChange={(e) => updateField('stopLoss', e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    className="tlab-range tlab-range--blue"
                    min={entryBounds.min}
                    max={entryBounds.max}
                    step={entryBounds.step}
                    value={clamp(safeNumber(form.stopLoss), entryBounds.min, entryBounds.max)}
                    onChange={(e) =>
                      updateField('stopLoss', clamp(safeNumber(e.target.value), entryBounds.min, entryBounds.max))
                    }
                    aria-label="Stop loss"
                  />
                </div>
                <div className="tlab-builder-row">
                  <div className="tlab-builder-row-head">
                    <label htmlFor="tlab-target-num">Target</label>
                    <input
                      id="tlab-target-num"
                      className="tlab-input tlab-input--inline"
                      type="number"
                      step={entryBounds.step}
                      value={form.targetPrice}
                      onChange={(e) => updateField('targetPrice', e.target.value)}
                    />
                  </div>
                  <input
                    type="range"
                    className="tlab-range tlab-range--blue"
                    min={entryBounds.min}
                    max={entryBounds.max}
                    step={entryBounds.step}
                    value={clamp(safeNumber(form.targetPrice), entryBounds.min, entryBounds.max)}
                    onChange={(e) =>
                      updateField('targetPrice', clamp(safeNumber(e.target.value), entryBounds.min, entryBounds.max))
                    }
                    aria-label="Take profit target"
                  />
                </div>
                <div className="tlab-builder-row">
                  <div className="tlab-builder-row-head">
                    <label htmlFor="tlab-risk-num">Risk %</label>
                    <input
                      id="tlab-risk-num"
                      className="tlab-input tlab-input--inline"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5"
                      value={form.riskPercent}
                      onChange={(e) => updateField('riskPercent', clamp(safeNumber(e.target.value, 1), 0.1, 5))}
                    />
                  </div>
                  <input
                    type="range"
                    className="tlab-range tlab-range--risk"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={clamp(safeNumber(form.riskPercent, 1), 0.1, 5)}
                    onChange={(e) => updateField('riskPercent', clamp(safeNumber(e.target.value), 0.1, 5))}
                    aria-label="Risk percent"
                  />
                </div>
              </div>

              <div className="tlab-field-grid tlab-field-grid--builder-extras">
                <div className="tlab-field tlab-field--span">
                  <label>Account size (USD)</label>
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

              <div className="tlab-rr-big tlab-rr-big--reward-first">
                <span className="tlab-rr-label">R∶R</span>
                <span className="tlab-rr-value">
                  {Number.isFinite(rr) && rr > 0 ? `${rr.toFixed(1)} : 1` : '—'}
                </span>
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
                <strong>{positionLotsLabel}</strong>
              </div>
            </div>
          </aside>

          <div className="trader-lab-v2__decision tlab-card tlab-card--gold" aria-label="Decision engine">
            <h3 className="tlab-decision-heading">Decision Engine</h3>
            <div className="tlab-decision-bar">
              <div className="tlab-decision-checks" role="list">
                {[
                  { key: 'biasAligned', label: 'Bias aligned' },
                  { key: 'setupValid', label: 'Setup valid' },
                  { key: 'entryConfirmed', label: 'Confirmation' },
                  { key: 'riskDefined', label: 'Risk valid' },
                ].map(({ key, label }) => (
                  <label key={key} className="tlab-decision-check">
                    <input
                      type="checkbox"
                      checked={Boolean(form[key])}
                      onChange={(e) => updateField(key, e.target.checked)}
                    />
                    <span className="tlab-decision-check__ui" aria-hidden />
                    <span className="tlab-decision-check__label">{label}</span>
                  </label>
                ))}
              </div>

              <div className="tlab-conviction" role="group" aria-label="Conviction">
                <span className="tlab-conviction__legend">Conviction</span>
                <div className="tlab-conviction__seg">
                  {[
                    { id: 'low', label: 'Low' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'high', label: 'High' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`tlab-conviction-btn${form.conviction === id ? ' tlab-conviction-btn--active' : ''}`}
                      onClick={() => updateField('conviction', id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tlab-decision-execute-wrap">
                <button
                  type="button"
                  className="tlab-execute-btn"
                  disabled={!readyToExecute || saving}
                  onClick={handleExecute}
                >
                  {saving ? '…' : 'EXECUTE'}
                </button>
                <p className="tlab-decision-hint">
                  Flow: Market Decoder → Export → refine here → EXECUTE opens the checklist; thesis carries to the calculator.
                  Use the Trade Validator tabs for Playbook rules and Replay review.
                </p>
                <p className="tlab-decision-meta">
                  Last saved: {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>
          </div>

          <footer className="trader-lab-v2__footer trader-lab-v2__footer--tagline-only">
            <p className="tlab-tagline">Trade with clarity. Execute with precision. Win with discipline.</p>
          </footer>
        </div>
      ) : null}
    </TraderSuiteShell>
  );
}
