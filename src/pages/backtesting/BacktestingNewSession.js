import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Api from '../../services/Api';
import { toast } from 'react-toastify';

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

function toLocalDateTimeInput(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function deriveEndDate(startIsoDate) {
  if (!startIsoDate) return '';
  const d = new Date(`${startIsoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function BacktestingNewSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftFromUrl = searchParams.get('draft');

  const [saving, setSaving] = useState(false);
  const [draftSessionId, setDraftSessionId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [instrument, setInstrument] = useState('EURUSD');
  const [replayTimeframe, setReplayTimeframe] = useState('M15');
  const [startDateTime, setStartDateTime] = useState('');
  const [initialBalance, setInitialBalance] = useState(100000);

  const [dateEnd, setDateEnd] = useState('');
  const [replayGranularity, setReplayGranularity] = useState('candle');
  const [tradingHoursMode, setTradingHoursMode] = useState('all');
  const [riskModel, setRiskModel] = useState('fixed_percent');
  const [extraInstruments, setExtraInstruments] = useState([]);
  const [sessionName, setSessionName] = useState('');
  const [notes, setNotes] = useState('');
  const [strategyContext, setStrategyContext] = useState(defaultStrategyContext);

  const hydrateFromSession = useCallback((s) => {
    if (!s) return;
    const list = Array.isArray(s.instruments) && s.instruments.length ? s.instruments : ['EURUSD'];
    setSessionName(s.sessionName || '');
    setNotes(s.description || s.notes || '');
    setInstrument(list[0] || 'EURUSD');
    setExtraInstruments(list.slice(1, 5));
    setStartDateTime(toLocalDateTimeInput(s.lastReplayAt || `${s.dateStart || new Date().toISOString().slice(0, 10)}T09:00:00`));
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
    if (!startDateTime) setStartDateTime(toLocalDateTimeInput(new Date()));
  }, [startDateTime]);

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
    const primary = String(instrument || '').trim().toUpperCase();
    const extras = extraInstruments
      .map((x) => String(x || '').trim().toUpperCase())
      .filter(Boolean);
    const instruments = [primary, ...extras].filter(Boolean).slice(0, 5);
    const dateStart = startDateTime ? startDateTime.slice(0, 10) : '';
    const dateEndFinal = dateEnd || deriveEndDate(dateStart) || dateStart;

    return {
      saveDraft,
      sessionName: sessionName || `${primary || 'Market'} ${replayTimeframe} Replay`,
      description: notes,
      marketType: 'forex',
      instruments,
      dateStart: dateStart || null,
      dateEnd: dateEndFinal || null,
      replayTimeframe,
      replayGranularity,
      tradingHoursMode,
      initialBalance: Number(initialBalance) || 100000,
      riskModel,
      strategyContext,
      draftForm: {
        sessionName,
        notes,
        instruments,
        startDateTime,
        dateStart,
        dateEnd: dateEndFinal,
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

  const startReplay = async () => {
    if (!String(instrument || '').trim()) {
      toast.error('Instrument is required.');
      return;
    }
    if (!startDateTime) {
      toast.error('Start date/time is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(false);
      const replayIso = new Date(startDateTime).toISOString();

      if (draftSessionId || draftFromUrl) {
        const id = draftSessionId || draftFromUrl;
        await Api.patchBacktestingSession(id, { ...payload, status: 'active', saveDraft: false });
        await Api.resumeBacktestingSession(id);
        await Api.patchBacktestingSession(id, {
          lastActiveInstrument: String(instrument || '').trim().toUpperCase(),
          replayTimeframe,
          lastReplayAt: replayIso,
        });
        navigate(`/backtesting/session/${id}`);
        return;
      }

      const res = await Api.createBacktestingSession(payload);
      if (res.data?.success && res.data.session?.id) {
        const createdId = res.data.session.id;
        await Api.patchBacktestingSession(createdId, {
          lastActiveInstrument: String(instrument || '').trim().toUpperCase(),
          replayTimeframe,
          lastReplayAt: replayIso,
        });
        navigate(`/backtesting/session/${createdId}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not start replay');
    } finally {
      setSaving(false);
    }
  };

  const addInstrument = () => {
    if (extraInstruments.length >= 4) return;
    setExtraInstruments([...extraInstruments, '']);
  };

  return (
    <>
      <header className="bt-hero">
        <h1 className="bt-hero-title">Start Backtest</h1>
        <p className="bt-hero-sub">Pick a market and jump to replay fast.</p>
      </header>

      <div className="aa-card bt-quickstart-card">
        <h2 className="aa-section-title-lg">
          <span className="aa-title-dot" />
          Quick Start
        </h2>
        <div className="bt-form-grid bt-quickstart-grid">
          <div>
            <label className="bt-label">Instrument</label>
            <input className="bt-input" value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="EURUSD" />
          </div>
          <div>
            <label className="bt-label">Timeframe</label>
            <select className="bt-select" value={replayTimeframe} onChange={(e) => setReplayTimeframe(e.target.value)}>
              {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="bt-label">Start date/time</label>
            <input className="bt-input" type="datetime-local" value={startDateTime} onChange={(e) => setStartDateTime(e.target.value)} />
          </div>
          <div>
            <label className="bt-label">Starting balance</label>
            <input className="bt-input" type="number" min={1000} step={100} value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
          </div>
        </div>
        <div className="bt-hero-actions bt-quickstart-actions">
          <button type="button" className="bt-btn bt-btn--primary bt-quickstart-actions__primary" disabled={saving} onClick={startReplay}>
            {saving ? 'Starting…' : 'Start Replay'}
          </button>
          <button type="button" className="bt-btn bt-btn--ghost" disabled={saving} onClick={saveDraft}>
            Save draft
          </button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => navigate('/backtesting')}>
            Cancel
          </button>
        </div>
      </div>

      <div className="aa-card bt-advanced-card">
        <button type="button" className="bt-btn bt-btn--ghost bt-advanced-toggle" onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen}>
          {advancedOpen ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
        </button>

        {advancedOpen && (
          <div className="bt-form-grid bt-advanced-grid" style={{ marginTop: 14 }}>
            <div>
              <label className="bt-label">End date</label>
              <input className="bt-input" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
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
              <label className="bt-label">Risk model</label>
              <select className="bt-select" value={riskModel} onChange={(e) => setRiskModel(e.target.value)}>
                <option value="fixed_lot">Fixed lot</option>
                <option value="fixed_percent">Fixed %</option>
                <option value="manual">Manual per trade</option>
              </select>
            </div>
            <div>
              <label className="bt-label">Replay granularity</label>
              <select className="bt-select" value={replayGranularity} onChange={(e) => setReplayGranularity(e.target.value)}>
                <option value="candle">Candle</option>
                <option value="tick">Tick (future)</option>
              </select>
            </div>

            {extraInstruments.map((sym, i) => (
              <div key={i}>
                <label className="bt-label">Extra instrument {i + 1}</label>
                <input
                  className="bt-input"
                  value={sym}
                  onChange={(e) => {
                    const next = [...extraInstruments];
                    next[i] = e.target.value;
                    setExtraInstruments(next);
                  }}
                />
              </div>
            ))}
            <div>
              <label className="bt-label">&nbsp;</label>
              <button type="button" className="bt-btn bt-btn--ghost" onClick={addInstrument}>
                + Add extra instrument
              </button>
            </div>

            <div>
              <label className="bt-label">Session name</label>
              <input className="bt-input" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="bt-label">Notes</label>
              <textarea className="bt-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
              <label className="bt-label">Entry model</label>
              <input className="bt-input" value={strategyContext.entryModel} onChange={(e) => setStrategyContext({ ...strategyContext, entryModel: e.target.value })} />
            </div>
            <div>
              <label className="bt-label">Bias model</label>
              <input className="bt-input" value={strategyContext.biasModel} onChange={(e) => setStrategyContext({ ...strategyContext, biasModel: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
