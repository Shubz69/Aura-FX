import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Api from '../../services/Api';
import { toast } from 'react-toastify';

const MARKETS = ['forex', 'indices', 'commodities', 'stocks', 'crypto', 'futures', 'other'];
const OBJECTIVES = [
  { value: 'playbook', label: 'Test a specific playbook', hint: 'Isolate one strategy card and measure expectancy.' },
  { value: 'entry_model', label: 'Test an entry model', hint: 'Same trigger, varied context — see when it holds.' },
  { value: 'time_edge', label: 'Test session / time-of-day edge', hint: 'Asia, London, NY — where does simulated edge cluster?' },
  { value: 'instrument', label: 'Test a specific instrument', hint: 'Behaviour, volatility, and structure on one symbol.' },
  { value: 'risk_model', label: 'Test a risk model', hint: 'Fixed % vs fixed lot vs manual — impact on R and drawdowns.' },
  { value: 'market_conditions', label: 'Test market condition behaviour', hint: 'Trend vs range, news days, liquidity regimes.' },
];

const STEP_META = [
  { n: 1, title: 'Session identity', short: 'Identity' },
  { n: 2, title: 'Scope & risk', short: 'Scope' },
  { n: 3, title: 'Strategy context', short: 'Context' },
  { n: 4, title: 'Review & launch', short: 'Review' },
];

const defaultStrategyContext = () => ({
  entryModel: '',
  biasModel: '',
  marketConditions: [],
  allowedSessions: ['Asia', 'London', 'New York'],
  allowedTimeframes: ['M15', 'H1'],
  confluenceTemplate: [
    { key: 'trend', label: 'Trend alignment' },
    { key: 'session', label: 'Session alignment' },
    { key: 'liquidity', label: 'Liquidity / context' },
    { key: 'htf', label: 'HTF bias' },
    { key: 'trigger', label: 'Entry trigger' },
    { key: 'rr', label: 'RR valid' },
    { key: 'news', label: 'News consideration' },
    { key: 'risk', label: 'Risk valid' },
  ],
  notesTemplate: '',
  defaultTpSlBehavior: '',
  defaultPartialsBehavior: '',
  defaultTags: [],
});

export default function BacktestingNewSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftFromUrl = searchParams.get('draft');

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [draftSessionId, setDraftSessionId] = useState(null);
  const [playbooks, setPlaybooks] = useState([]);

  const [sessionName, setSessionName] = useState('');
  const [description, setDescription] = useState('');
  const [playbookId, setPlaybookId] = useState('');
  const [playbookName, setPlaybookName] = useState('');
  const [objective, setObjective] = useState('');
  const [objectiveDetail, setObjectiveDetail] = useState('');
  const [marketType, setMarketType] = useState('forex');
  const [instruments, setInstruments] = useState(['EURUSD']);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [replayTimeframe, setReplayTimeframe] = useState('M15');
  const [replayGranularity, setReplayGranularity] = useState('candle');
  const [tradingHoursMode, setTradingHoursMode] = useState('all');
  const [initialBalance, setInitialBalance] = useState(100000);
  const [riskModel, setRiskModel] = useState('fixed_percent');
  const [strategyContext, setStrategyContext] = useState(defaultStrategyContext);
  const [stepError, setStepError] = useState('');

  const stepBlockers = useCallback((stepToValidate) => {
    const blockers = [];
    const inst = instruments.map((x) => String(x || '').trim()).filter(Boolean);
    const hasBadInstrumentRows = instruments.some((x) => String(x || '').trim() === '');

    if (stepToValidate >= 1) {
      if (!sessionName.trim()) blockers.push('Session name is required.');
      if (!objective) blockers.push('Choose what you are testing (objective).');
    }

    if (stepToValidate >= 2) {
      if (!inst.length) blockers.push('Add at least one instrument.');
      if (hasBadInstrumentRows) blockers.push('Remove or fill empty instrument rows.');
      if (!dateStart || !dateEnd) blockers.push('Set both date start and date end.');
      if (dateStart && dateEnd && dateStart > dateEnd) blockers.push('Date start must be before or equal to date end.');
    }

    return blockers;
  }, [sessionName, objective, instruments, dateStart, dateEnd]);

  const loadPlaybooks = useCallback(async () => {
    try {
      const res = await Api.getTraderPlaybookSetups();
      const list = res.data?.setups || [];
      setPlaybooks(Array.isArray(list) ? list : []);
    } catch {
      setPlaybooks([]);
    }
  }, []);

  useEffect(() => {
    loadPlaybooks();
  }, [loadPlaybooks]);

  const hydrateFromSession = useCallback((s) => {
    if (!s) return;
    setSessionName(s.sessionName || '');
    setDescription(s.description || '');
    setPlaybookId(s.playbookId || '');
    setPlaybookName(s.playbookName || '');
    setObjective(s.objective || '');
    setObjectiveDetail(s.objectiveDetail || '');
    setMarketType(s.marketType || 'forex');
    setInstruments(Array.isArray(s.instruments) && s.instruments.length ? s.instruments : ['EURUSD']);
    setDateStart(s.dateStart || '');
    setDateEnd(s.dateEnd || '');
    setReplayTimeframe(s.replayTimeframe || 'M15');
    setReplayGranularity(s.replayGranularity || 'candle');
    setTradingHoursMode(s.tradingHoursMode || 'all');
    setInitialBalance(s.initialBalance ?? 100000);
    setRiskModel(s.riskModel || 'fixed_percent');
    setStrategyContext({ ...defaultStrategyContext(), ...(s.strategyContext || {}) });
    setDraftSessionId(s.id);
  }, []);

  useEffect(() => {
    const id = draftFromUrl || draftSessionId;
    if (!id) return undefined;
    (async () => {
      try {
        const res = await Api.getBacktestingSession(id);
        if (res.data?.success && res.data.session) hydrateFromSession(res.data.session);
      } catch {
        toast.error('Could not load draft');
      }
    })();
  }, [draftFromUrl, draftSessionId, hydrateFromSession]);

  const buildPayload = (saveDraft) => {
    const inst = instruments.map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
    return {
      saveDraft,
      sessionName: sessionName || 'Untitled session',
      description,
      playbookId: playbookId || null,
      playbookName: playbookName || null,
      objective: objective || null,
      objectiveDetail,
      marketType,
      instruments: inst,
      dateStart: dateStart || null,
      dateEnd: dateEnd || null,
      replayTimeframe,
      replayGranularity,
      tradingHoursMode,
      initialBalance: Number(initialBalance) || 100000,
      riskModel,
      strategyContext,
      draftForm: {
        step,
        sessionName,
        description,
        playbookId,
        playbookName,
        objective,
        objectiveDetail,
        marketType,
        instruments: inst,
        dateStart,
        dateEnd,
        replayTimeframe,
        replayGranularity,
        tradingHoursMode,
        initialBalance,
        riskModel,
        strategyContext,
      },
    };
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      if (draftSessionId || draftFromUrl) {
        const id = draftSessionId || draftFromUrl;
        await Api.patchBacktestingSession(id, { ...buildPayload(true), status: 'draft' });
        toast.success('Draft saved');
      } else {
        const res = await Api.createBacktestingSession(buildPayload(true));
        if (res.data?.success && res.data.session?.id) {
          setDraftSessionId(res.data.session.id);
          navigate(`/backtesting/new?draft=${res.data.session.id}`, { replace: true });
          toast.success('Draft saved');
        }
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const createSession = async () => {
    const blockers = stepBlockers(4);
    if (blockers.length > 0) {
      toast.error(`Cannot create session yet: ${blockers[0]}`);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(false);
      if (draftSessionId || draftFromUrl) {
        const id = draftSessionId || draftFromUrl;
        await Api.patchBacktestingSession(id, {
          ...payload,
          status: 'active',
          saveDraft: false,
        });
        await Api.resumeBacktestingSession(id);
        navigate(`/backtesting/session/${id}`);
        return;
      }
      const res = await Api.createBacktestingSession(payload);
      if (res.data?.success && res.data.session?.id) {
        navigate(`/backtesting/session/${res.data.session.id}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not create session');
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    const blockers = stepBlockers(step);
    if (blockers.length > 0) {
      setStepError(blockers[0]);
      return;
    }
    setStepError('');
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    setStepError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const canCreate = () => stepBlockers(4).length === 0;

  const currentStepBlockers = stepBlockers(step);

  const addInstrument = () => {
    if (instruments.length >= 5) return;
    setInstruments([...instruments, '']);
  };

  return (
    <>
      <header className="bt-hero">
        <p className="bt-hero-kicker">Guided setup</p>
        <h1 className="bt-hero-title">New backtest session</h1>
        <p className="bt-hero-sub">
          Define what you are testing, the replay window, and risk assumptions — then step through history with institutional-grade logging.
        </p>
        <div className="bt-hero-actions">
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => navigate('/backtesting')}>
            Cancel
          </button>
          <button type="button" className="bt-btn bt-btn--ghost" disabled={saving} onClick={saveDraft}>
            Save draft
          </button>
        </div>
      </header>

      <div className="bt-wizard-progress">
        <div className="bt-wizard-progress-fill" style={{ width: `${(step / 4) * 100}%` }} />
      </div>
      <div className="bt-wizard-steps">
        {STEP_META.map((s) => (
          <span
            key={s.n}
            className={`bt-wizard-step${step === s.n ? ' bt-wizard-step--active' : ''}${step > s.n ? ' bt-wizard-step--done' : ''}`}
          >
            {s.n}. {s.short}
          </span>
        ))}
      </div>
      {stepError && <p className="bt-inline-err">{stepError}</p>}

      {step === 1 && (
        <div className="aa-card">
          <h2 className="aa-section-title-lg">
            <span className="aa-title-dot" />
            {STEP_META[0].title}
          </h2>
          <div className="bt-form-grid">
            <div>
              <label className="bt-label" htmlFor="bt-name">
                Session name
              </label>
              <input id="bt-name" className="bt-input" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
            </div>
            <div>
              <label className="bt-label" htmlFor="bt-market">
                Market type
              </label>
              <select id="bt-market" className="bt-select" value={marketType} onChange={(e) => setMarketType(e.target.value)}>
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label" htmlFor="bt-desc">
                Description
              </label>
              <textarea id="bt-desc" className="bt-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="bt-label" htmlFor="bt-pb">
                Playbook / strategy
              </label>
              <select
                id="bt-pb"
                className="bt-select"
                value={playbookId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPlaybookId(id);
                  const p = playbooks.find((x) => x.id === id);
                  setPlaybookName(p?.name || '');
                }}
              >
                <option value="">— Optional —</option>
                {playbooks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label" htmlFor="bt-obj">
                What are you testing?
              </label>
              <select id="bt-obj" className="bt-select" value={objective} onChange={(e) => setObjective(e.target.value)}>
                <option value="">Select objective…</option>
                {OBJECTIVES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {objective && (
                <p className="bt-field-hint">{OBJECTIVES.find((x) => x.value === objective)?.hint}</p>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label" htmlFor="bt-objd">
                Objective detail
              </label>
              <textarea id="bt-objd" className="bt-textarea" value={objectiveDetail} onChange={(e) => setObjectiveDetail(e.target.value)} rows={2} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="aa-card">
          <h2 className="aa-section-title-lg">
            <span className="aa-title-dot" />
            {STEP_META[1].title}
          </h2>
          <p className="bt-field-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Up to five instruments per session. Replay focus follows the chip you select in the workspace.
          </p>
          <div className="bt-form-grid">
            {instruments.map((sym, i) => (
              <div key={i}>
                <label className="bt-label">Instrument {i + 1}</label>
                <input
                  className="bt-input"
                  value={sym}
                  onChange={(e) => {
                    const nextI = [...instruments];
                    nextI[i] = e.target.value;
                    setInstruments(nextI);
                  }}
                />
              </div>
            ))}
            <div>
              <label className="bt-label">&nbsp;</label>
              <button type="button" className="bt-btn bt-btn--ghost" onClick={addInstrument}>
                + Add instrument
              </button>
            </div>
            <div>
              <label className="bt-label">Date start</label>
              <input className="bt-input" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </div>
            <div>
              <label className="bt-label">Date end</label>
              <input className="bt-input" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
            <div>
              <label className="bt-label">Base timeframe</label>
              <select className="bt-select" value={replayTimeframe} onChange={(e) => setReplayTimeframe(e.target.value)}>
                {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="bt-label">Replay granularity</label>
              <select className="bt-select" value={replayGranularity} onChange={(e) => setReplayGranularity(e.target.value)}>
                <option value="candle">Candle</option>
                <option value="tick">Tick (future)</option>
              </select>
            </div>
            <div>
              <label className="bt-label">Trading hours</label>
              <select className="bt-select" value={tradingHoursMode} onChange={(e) => setTradingHoursMode(e.target.value)}>
                <option value="regular">Regular</option>
                <option value="extended">Extended</option>
                <option value="all">All hours</option>
              </select>
            </div>
            <div>
              <label className="bt-label">Initial balance</label>
              <input
                className="bt-input"
                type="number"
                min={1000}
                step={100}
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
              />
            </div>
            <div>
              <label className="bt-label">Risk model</label>
              <select className="bt-select" value={riskModel} onChange={(e) => setRiskModel(e.target.value)}>
                <option value="fixed_lot">Fixed lot</option>
                <option value="fixed_percent">Fixed %</option>
                <option value="manual">Manual per trade</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="aa-card">
          <h2 className="aa-section-title-lg">
            <span className="aa-title-dot" />
            {STEP_META[2].title}
          </h2>
          <div className="bt-form-grid">
            <div>
              <label className="bt-label">Entry model</label>
              <input
                className="bt-input"
                value={strategyContext.entryModel}
                onChange={(e) => setStrategyContext({ ...strategyContext, entryModel: e.target.value })}
              />
            </div>
            <div>
              <label className="bt-label">Bias model</label>
              <input
                className="bt-input"
                value={strategyContext.biasModel}
                onChange={(e) => setStrategyContext({ ...strategyContext, biasModel: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label">Default TP / SL behavior (notes)</label>
              <textarea
                className="bt-textarea"
                rows={2}
                value={strategyContext.defaultTpSlBehavior}
                onChange={(e) => setStrategyContext({ ...strategyContext, defaultTpSlBehavior: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label">Default partials behavior</label>
              <textarea
                className="bt-textarea"
                rows={2}
                value={strategyContext.defaultPartialsBehavior}
                onChange={(e) => setStrategyContext({ ...strategyContext, defaultPartialsBehavior: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label">Confluence checklist template (used in workspace)</label>
              <p className="bt-muted" style={{ marginTop: 0 }}>
                Standard items are prefilled; scores feed analytics.
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="aa-card aa-card--accent">
          <h2 className="aa-section-title-lg">
            <span className="aa-title-dot" />
            {STEP_META[3].title}
          </h2>
          <p className="bt-field-hint">Confirm details before launch. You can still pause and edit playbook focus from the workspace.</p>
          <ul className="bt-insight-list">
            <li>
              <strong>Name:</strong> {sessionName || '—'}
            </li>
            <li>
              <strong>Market:</strong> {marketType}
            </li>
            <li>
              <strong>Instruments:</strong> {instruments.filter(Boolean).join(', ') || '—'}
            </li>
            <li>
              <strong>Range:</strong> {dateStart || '—'} → {dateEnd || '—'}
            </li>
            <li>
              <strong>Timeframe:</strong> {replayTimeframe} · <strong>Risk:</strong> {riskModel}
            </li>
            <li>
              <strong>Balance:</strong> {initialBalance}
            </li>
            {playbookName && (
              <li>
                <strong>Playbook:</strong> {playbookName}
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="bt-actions" style={{ marginTop: 8 }}>
        {currentStepBlockers.length > 0 && (
          <p className="bt-inline-err" role="status" aria-live="polite">
            {step < 4 ? 'Complete these before Next: ' : 'Complete these before Create session: '}
            {currentStepBlockers.join(' ')}
          </p>
        )}
        {step > 1 && (
          <button type="button" className="bt-btn bt-btn--ghost" onClick={back}>
            Back
          </button>
        )}
            {step < 4 && (
          <button type="button" className="bt-btn bt-btn--primary" onClick={next} disabled={currentStepBlockers.length > 0}>
            Next
          </button>
        )}
        {step === 4 && (
          <button type="button" className="bt-btn bt-btn--primary" disabled={saving || !canCreate()} onClick={createSession}>
            Create session
          </button>
        )}
      </div>
    </>
  );
}
