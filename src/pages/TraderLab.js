import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import TraderSuiteShell from '../components/TraderSuiteShell';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
import { formatWelcomeEyebrow, getUserFirstName } from '../utils/welcomeUser';
import { FaPen } from 'react-icons/fa';
import {
  PLAYBOOK_SETUP_OPTIONS,
  buildTraderLabHandoff,
  buildValidator,
  calculateRiskAmount,
  calculatePositionSizeUnits,
  calculateRiskReward,
  confidenceToConviction,
  convictionToConfidence,
  formatPositionLots,
  safeNumber,
  toYmd,
} from '../utils/traderSuite';
import {
  TRADER_LAB_HANDOFF_KEY,
  MARKET_DECODER_LAB_HANDOFF_KEY,
} from '../lib/aura-analysis/validator/validatorChecklistStorage';

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
  whatDoISee:
    'Strong U.S. economic data supporting risk tone\nInstitutional inflows into metals\nDXY softening into NY close',
  setupName: 'London Breakout',
  whyValid: 'GDP Growth: 3.2% YoY\nInflation cooling: 2.9% → 2.4%\nSector strength in metals and energy',
  entryConfirmation:
    'Price respected the ascending channel. Wait for a bullish 1H close above local structure before scaling. Invalidation on acceptance back inside the range.',
  conviction: 'medium',
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

const TRADER_LAB_LOCAL_DRAFT_KEY = 'aura_trader_lab_last_draft_v1';

function readLocalDraft() {
  try {
    const raw = localStorage.getItem(TRADER_LAB_LOCAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalDraft(payload) {
  try {
    localStorage.setItem(TRADER_LAB_LOCAL_DRAFT_KEY, JSON.stringify(payload || {}));
  } catch {
    // ignore storage failures
  }
}

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
  return merged;
}

function linesToList(text) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);
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

function sentimentPillClass(s) {
  const x = String(s).toLowerCase();
  if (x.includes('positive') || x.includes('improv') || x.includes('bull')) return 'tlab-geo-pill tlab-geo-pill--pos';
  if (x.includes('negative') || x.includes('bear')) return 'tlab-geo-pill tlab-geo-pill--neg';
  return 'tlab-geo-pill tlab-geo-pill--mid';
}

function BiasPill({ bias }) {
  const b = String(bias || '').toLowerCase();
  let cls = 'tlab-pill-bias tlab-pill-bias--neutral';
  if (b.includes('bull')) cls = 'tlab-pill-bias tlab-pill-bias--bull';
  if (b.includes('bear')) cls = 'tlab-pill-bias tlab-pill-bias--bear';
  return <span className={cls}>{String(bias || '—').toUpperCase()}</span>;
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
  const decoderImportAppliedRef = React.useRef(false);

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
        } else {
          const localDraft = readLocalDraft();
          if (localDraft) {
            setForm(normalizeSession(localDraft));
          }
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

  useEffect(() => {
    if (loading || decoderImportAppliedRef.current) return;
    let raw = '';
    try {
      raw = sessionStorage.getItem(MARKET_DECODER_LAB_HANDOFF_KEY) || '';
    } catch {
      raw = '';
    }
    if (!raw) return;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.brief) return;
    const brief = parsed.brief || {};
    const symbol = String(parsed.symbol || brief?.header?.asset || '').toUpperCase();
    const mapped = normalizeSession({
      ...DEFAULT_FORM,
      sessionDate: toYmd(),
      setupName: symbol ? `Market Decoder · ${symbol}` : DEFAULT_FORM.setupName,
      chartSymbol: symbol ? `OANDA:${symbol.replace('/', '')}` : DEFAULT_FORM.chartSymbol,
      marketBias: brief?.instantRead?.bias || DEFAULT_FORM.marketBias,
      marketState: brief?.finalOutput?.currentPosture || DEFAULT_FORM.marketState,
      sessionGoal:
        brief?.finalOutput?.currentPosture
        || brief?.finalOutput?.postureSubtitle
        || DEFAULT_FORM.sessionGoal,
      whatDoISee: Array.isArray(brief?.whatMattersNow)
        ? brief.whatMattersNow
          .map((x) => `${x?.label || 'Signal'}: ${x?.text || ''}`.trim())
          .filter(Boolean)
          .join('\n')
        : DEFAULT_FORM.whatDoISee,
      entryConfirmation:
        brief?.executionGuidance?.entryCondition
        || brief?.executionGuidance?.preferredDirection
        || DEFAULT_FORM.entryConfirmation,
      whyValid:
        brief?.finalOutput?.whyThisPosture
        || brief?.executionGuidance?.invalidation
        || DEFAULT_FORM.whyValid,
      decoderContext: {
        symbol,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        source: 'market_decoder',
        generatedAt: brief?.meta?.generatedAt || null,
        posture: brief?.finalOutput?.currentPosture || null,
      },
    });
    decoderImportAppliedRef.current = true;
    setActiveId(null);
    setForm(mapped);
    writeLocalDraft(mapped);
    setLastSavedAt(null);
    try {
      sessionStorage.removeItem(MARKET_DECODER_LAB_HANDOFF_KEY);
    } catch {
      // ignore
    }
    toast.success('Market Decoder context imported into Trader Lab. Save to keep it.');
  }, [loading]);

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

  const tradeValidatorRows = useMemo(() => {
    const rrStatus = rr >= 2 ? 'OPTIMAL' : rr >= 1 ? 'OK' : 'WEAK';
    const conflictStatus = form.setupValid && form.riskDefined ? 'CLEAR' : 'REVIEW';
    return [
      { label: 'Trend alignment', status: form.biasAligned ? 'YES' : 'NO', ok: form.biasAligned },
      { label: 'Risk / reward', status: rrStatus, ok: rr >= 1 },
      { label: 'Entry confirmation', status: form.entryConfirmed ? 'VALID' : 'PENDING', ok: form.entryConfirmed },
      { label: 'No major conflicts', status: conflictStatus, ok: form.setupValid && form.riskDefined },
    ];
  }, [form.biasAligned, form.setupValid, form.riskDefined, form.entryConfirmed, rr]);

  const validatorPanelOk = tradeValidatorRows.every((r) => r.ok);

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

  const geoRows = useMemo(() => parseGeopoliticalBlock(form.todaysFocus), [form.todaysFocus]);
  const driverLines = useMemo(() => linesToList(form.whatDoISee), [form.whatDoISee]);
  const fundamentalLines = useMemo(() => linesToList(form.whyValid), [form.whyValid]);

  const newsRiskLabel = form.emotionalIntensity >= 55 ? 'Moderate' : 'Low';
  const volLabel =
    form.riskLevel === 'High' ? 'High' : form.riskLevel === 'Low' ? 'Low' : 'Moderate';
  const eventRiskLabel = form.emotionalIntensity >= 40 ? 'Moderate' : 'Low';

  const updateField = (key, value) => {
    if (key === 'conviction') {
      const confidence = convictionToConfidence(value);
      setForm((prev) => ({
        ...prev,
        conviction: value,
        confidence,
        auraConfidence: confidence,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
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
        writeLocalDraft(saved);
        setLastSavedAt(new Date().toISOString());
      } else {
        const res = await Api.createTraderLabSession(payload);
        const saved = normalizeSession(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        writeLocalDraft(saved);
        setLastSavedAt(new Date().toISOString());
      }
      toast.success('Trader Lab saved');
    } catch (error) {
      console.error(error);
      const fallback = normalizeSession({ ...form, rrRatio: rr });
      writeLocalDraft(fallback);
      setLastSavedAt(new Date().toISOString());
      toast.warning('Cloud save failed. Saved locally on this device.');
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
      toast.warning('Complete the Decision Engine checks and ensure reward:risk is at least 1:1.');
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
      toast.success('Saved. Opening Trade Validator checklist.');
      navigate('/trader-deck/trade-validator/checklist', { state: { fromTraderLab: true } });
    } catch (error) {
      console.error(error);
      writeLocalDraft(normalizeSession({ ...form, rrRatio: rr }));
      toast.error('Could not execute this trade plan yet.');
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
        <div className="trader-lab-v2 trader-lab-v2--gold trader-lab-v2--compact">
          <aside className="trader-lab-v2__left">
            <div className="tlab-card tlab-card--gold">
              <h3 className="tlab-card__title">Trade thesis</h3>
              <div className="tlab-pill-row">
                <BiasPill bias={form.marketBias} />
                <span className="tlab-pill-confidence">{form.auraConfidence}%</span>
              </div>
              <div className="tlab-field" style={{ marginBottom: 8 }}>
                <label>Bias</label>
                <select className="tlab-select" value={form.marketBias} onChange={(e) => updateField('marketBias', e.target.value)}>
                  {['Bullish', 'Bearish', 'Neutral', 'Bullish intraday'].map((s) => (
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
              <ul className="tlab-ref-bullets">
                {driverLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.whatDoISee}
                onChange={(e) => updateField('whatDoISee', e.target.value)}
                placeholder="One line per driver..."
                aria-label="Key drivers"
              />
            </div>

            <div className="tlab-card tlab-card--gold">
              <h3 className="tlab-card__title">Fundamental backing</h3>
              <ul className="tlab-ref-bullets">
                {fundamentalLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <textarea
                className="tlab-textarea tlab-textarea--tight"
                value={form.whyValid}
                onChange={(e) => updateField('whyValid', e.target.value)}
                placeholder="One line per fundamental point..."
                aria-label="Fundamental backing"
              />
            </div>

            <div className="tlab-card tlab-card--gold">
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
                        <td>
                          <span className={sentimentPillClass(row.sentiment)}>
                            {String(row.sentiment).toUpperCase()}
                          </span>
                        </td>
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

            <div className="tlab-card tlab-card--gold">
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
                    <td>Event risk</td>
                    <td><span className="tlab-pill tlab-pill--ok">{eventRiskLabel}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="tlab-card tlab-card--gold">
              <h3 className="tlab-card__title">Trader thesis</h3>
              <div className="tlab-thesis-grid">
                <div className="tlab-field">
                  <label>1. What do I see?</label>
                  <textarea
                    className="tlab-textarea tlab-textarea--tight"
                    value={form.whatDoISee}
                    onChange={(e) => updateField('whatDoISee', e.target.value)}
                    placeholder="Structure, flow, context..."
                  />
                </div>
                <div className="tlab-field">
                  <label>2. Why is this valid?</label>
                  <textarea
                    className="tlab-textarea tlab-textarea--tight"
                    value={form.whyValid}
                    onChange={(e) => updateField('whyValid', e.target.value)}
                    placeholder="Confluence and backing..."
                  />
                </div>
                <div className="tlab-field">
                  <label>3. What confirms entry?</label>
                  <textarea
                    className="tlab-textarea tlab-textarea--tight"
                    value={form.entryConfirmation}
                    onChange={(e) => updateField('entryConfirmation', e.target.value)}
                    placeholder="Trigger and invalidation..."
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

            <div className="tlab-center-split tlab-center-split--refined">
              <div className="tlab-card tlab-card--gold tlab-card--exec">
                <div className="tlab-exec-head">
                  <h3 className="tlab-card__title">Execution notes</h3>
                  <span className="tlab-exec-edit-icon" title="Edit notes" aria-hidden>
                    <FaPen />
                  </span>
                </div>
                <textarea
                  className="tlab-textarea tlab-textarea--exec"
                  value={form.duringNotes}
                  onChange={(e) => updateField('duringNotes', e.target.value)}
                  placeholder="Live execution plan, scaling, and desk notes (separate from entry confirmation in Trader thesis)..."
                />
                <div className="tlab-exec-foot">
                  <span className="tlab-exec-meta">
                    Last updated: {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : '—'}
                  </span>
                  <button type="button" className="tlab-btn-save-notes" onClick={saveSession} disabled={saving}>
                    {saving ? 'SAVING...' : 'SAVE NOTES'}
                  </button>
                </div>
              </div>

              <div className="tlab-card tlab-card--gold tlab-card--decision-panel" aria-label="Decision engine">
                <div className="tlab-decision-mini">
                  <div className="tlab-decision-mini__cell">
                    <span className="tlab-level-label">Decision checks</span>
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
                  </div>
                  <div className="tlab-decision-mini__cell">
                    <span className="tlab-level-label">Conviction</span>
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
                  <div className="tlab-decision-mini__cell">
                    <span className="tlab-level-label">Decision engine</span>
                    <button
                      type="button"
                      className="tlab-execute-btn"
                      disabled={!readyToExecute || saving}
                      onClick={handleExecute}
                    >
                      {saving ? '…' : 'EXECUTE'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="trader-lab-v2__right">
            <div className="tlab-card tlab-card--gold">
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
              <div className="tlab-rr-big">
                <span className="tlab-rr-label">R∶R ratio</span>
                <span className="tlab-rr-value">
                  1 : {Number.isFinite(rr) && rr > 0 ? rr.toFixed(2) : '—'}
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

            <div className={`tlab-card tlab-card--gold tlab-card--validator${validatorPanelOk ? ' tlab-card--validator-pass' : ''}`}>
              <div className="tlab-validator-banner">{validatorPanelOk ? '✓ TRADE VALID' : 'BLOCKED'}</div>
              <ul className="tlab-validator-list tlab-validator-list--status">
                {tradeValidatorRows.map((row) => (
                  <li key={row.label}>
                    <span className="tlab-vlabel">{row.label}</span>
                    <span className={row.ok ? 'tlab-vstatus tlab-vstatus--ok' : 'tlab-vstatus'}>{row.status}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="tlab-card tlab-card--gold tlab-card--session-rail">
              <h3 className="tlab-card__title">Session focus</h3>
              <div className="tlab-field">
                <label htmlFor="tlab-session-goal">Today&apos;s goal</label>
                <textarea
                  id="tlab-session-goal"
                  className="tlab-textarea tlab-textarea--tight"
                  rows={3}
                  value={form.sessionGoal}
                  onChange={(e) => updateField('sessionGoal', e.target.value)}
                  placeholder="What you are optimizing this session for…"
                />
              </div>
              <div className="tlab-field" style={{ marginTop: 8 }}>
                <label htmlFor="tlab-max-trades">Max trades</label>
                <input
                  id="tlab-max-trades"
                  className="tlab-input"
                  type="number"
                  min={1}
                  max={99}
                  value={form.maxTradesAllowed}
                  onChange={(e) => updateField('maxTradesAllowed', safeNumber(e.target.value, DEFAULT_FORM.maxTradesAllowed))}
                />
              </div>
            </div>

          </aside>

          <footer className="trader-lab-v2__footer trader-lab-v2__footer--tagline-only">
            <p className="tlab-tagline">Trade with clarity. Execute with precision. Win with discipline.</p>
          </footer>
        </div>
      ) : null}
    </TraderSuiteShell>
  );
}
