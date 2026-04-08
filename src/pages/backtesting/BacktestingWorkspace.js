import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import Api from '../../services/Api';
import { toast } from 'react-toastify';
import { stepReplayTime } from '../../lib/backtesting/replayTime';
import { GradeBadge, TagPills } from '../../components/backtesting/BacktestingSharedUi';
import { BacktestingWorkspaceChartStage } from '../../components/backtesting/BacktestingChartStage';
import '../../styles/aura-analysis/AuraShared.css';
import '../../styles/backtesting/Backtesting.css';

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(d);
}

function defaultNotebook() {
  return {
    sessionNotes: '',
    observations: '',
    worked: '',
    failed: '',
    improvements: '',
    lessons: '',
    nextRefinement: '',
  };
}

function classify(pnl) {
  const p = Number(pnl);
  if (p > 1e-8) return 'win';
  if (p < -1e-8) return 'loss';
  return 'flat';
}

function computeRunningMetrics(trades, initialBalance) {
  const t = trades || [];
  const n = t.length;
  const ib0 = Number(initialBalance) || 0;
  if (!n) {
    return {
      n: 0,
      winRate: null,
      profitFactor: null,
      avgR: null,
      net: 0,
      bestSetup: null,
      bestInstrument: null,
      worstHabit: null,
      checklistAvg: null,
      grossProfit: 0,
      grossLoss: 0,
      initialBalance: ib0,
      equity: ib0,
    };
  }
  const wins = t.filter((x) => classify(x.pnlAmount) === 'win');
  const losses = t.filter((x) => classify(x.pnlAmount) === 'loss');
  const gp = wins.reduce((a, x) => a + Number(x.pnlAmount || 0), 0);
  const gl = losses.reduce((a, x) => a + Math.abs(Number(x.pnlAmount || 0)), 0);
  const net = t.reduce((a, x) => a + Number(x.pnlAmount || 0), 0);
  const rs = t.map((x) => x.rMultiple).filter((x) => x != null && Number.isFinite(Number(x)));
  const avgR = rs.length ? rs.reduce((a, b) => a + Number(b), 0) / rs.length : null;
  const pf = gl > 1e-9 ? gp / gl : null;
  const wr = n > 0 ? wins.length / n : null;

  const bySetup = new Map();
  for (const tr of t) {
    const k = tr.setupName || '—';
    if (!bySetup.has(k)) bySetup.set(k, []);
    bySetup.get(k).push(tr);
  }
  let bestSetup = null;
  let bestE = null;
  for (const [k, arr] of bySetup) {
    if (k === '—' || arr.length < 1) continue;
    const e = arr.reduce((a, x) => a + Number(x.pnlAmount || 0), 0) / arr.length;
    if (bestE == null || e > bestE) {
      bestE = e;
      bestSetup = k;
    }
  }

  const GRADE_RANK = { 'A+': 5, A: 4, B: 3, C: 2, D: 1 };
  const grades = t.map((x) => x.qualityGrade).filter(Boolean);
  let worstHabit = null;
  let worstRank = 99;
  for (const g of grades) {
    const r = GRADE_RANK[g] ?? 3;
    if (r < worstRank) {
      worstRank = r;
      worstHabit = g;
    }
  }
  if (!grades.length) worstHabit = null;

  const chk = t.map((x) => x.checklistScore).filter((x) => x != null && Number.isFinite(Number(x)));
  const checklistAvg = chk.length ? chk.reduce((a, b) => a + Number(b), 0) / chk.length : null;

  const byInst = new Map();
  for (const tr of t) {
    const k = tr.instrument || '—';
    if (!byInst.has(k)) byInst.set(k, []);
    byInst.get(k).push(tr);
  }
  let bestInstrument = null;
  let bestInstE = null;
  for (const [k, arr] of byInst) {
    if (k === '—' || arr.length < 1) continue;
    const e = arr.reduce((a, x) => a + Number(x.pnlAmount || 0), 0) / arr.length;
    if (bestInstE == null || e > bestInstE) {
      bestInstE = e;
      bestInstrument = k;
    }
  }

  return {
    n,
    winRate: wr,
    profitFactor: pf,
    avgR,
    net,
    bestSetup,
    bestInstrument,
    worstHabit,
    checklistAvg,
    grossProfit: gp,
    grossLoss: -gl,
    initialBalance: Number(initialBalance) || 0,
    equity: (Number(initialBalance) || 0) + net,
  };
}

function SessionBar({
  session,
  base,
  busy,
  playbooks,
  onPlaybookChange,
  onPause,
  onResume,
  onEnd,
  onAddTrade,
  activeInstrument,
  onInstrumentChange,
  replayAtLabel,
  runningMetrics,
}) {
  if (!session) return null;
  const instruments = session.instruments?.length ? session.instruments : ['EURUSD'];
  const focus = activeInstrument || session.lastActiveInstrument || instruments[0];
  const isCompleted = session.status === 'completed';
  const isPaused = session.status === 'paused';
  const navCls = ({ isActive }) => `bt-btn bt-btn--ghost bt-ws-navlink${isActive ? ' bt-ws-navlink--on' : ''}`;

  return (
    <div className={`bt-ws-sessionbar aa-card aa-card--accent${isCompleted ? ' bt-ws-sessionbar--completed' : ''}`}>
      {isCompleted && (
        <div className="bt-ws-sessionbar__ribbon" role="status">
          Session completed — replay and new trades are locked. Notebook, trades, and reports stay available.
        </div>
      )}
      <div className="bt-ws-sessionbar__top">
        <div className="bt-ws-sessionbar__identity">
          <span className="bt-ws-sessionbar__kicker">Backtesting terminal</span>
          <h2 className="bt-ws-sessionbar__title">{session.sessionName}</h2>
          <div className="bt-ws-sessionbar__pills">
            <span className={`aa-pill ${isCompleted ? 'aa-pill--dim' : 'aa-pill--accent'}`}>{session.status}</span>
            {session.playbookName ? (
              <span className="aa-pill aa-pill--dim">Playbook · {session.playbookName}</span>
            ) : (
              <span className="aa-pill aa-pill--dim">No playbook</span>
            )}
            <span className="aa-pill aa-pill--dim">Focus · {focus}</span>
          </div>
        </div>
        <div className="bt-ws-sessionbar__kpis">
          <div className="bt-ws-kpi-tile">
            <span className="bt-ws-kpi-tile__label">Initial balance</span>
            <span className="bt-ws-kpi-tile__val">{fmt(session.initialBalance)}</span>
          </div>
          <div className="bt-ws-kpi-tile">
            <span className="bt-ws-kpi-tile__label">Current balance</span>
            <span className="bt-ws-kpi-tile__val">{fmt(session.currentBalance)}</span>
          </div>
          <div className="bt-ws-kpi-tile">
            <span className="bt-ws-kpi-tile__label">Session equity</span>
            <span className="bt-ws-kpi-tile__val" title="Initial + sum of logged trade PnL in this workspace">
              {fmt(runningMetrics?.equity ?? session.currentBalance)}
            </span>
          </div>
          <div className="bt-ws-kpi-tile bt-ws-kpi-tile--accent">
            <span className="bt-ws-kpi-tile__label">Replay clock</span>
            <span className="bt-ws-kpi-tile__val bt-ws-kpi-tile__val--sm">{replayAtLabel}</span>
          </div>
        </div>
      </div>

      <div className="bt-ws-sessionbar__instruments">
        <span className="bt-ws-sessionbar__instruments-label">Instruments</span>
        <div className="bt-ws-chip-strip">
          {instruments.filter(Boolean).map((sym) => (
            <button
              key={sym}
              type="button"
              className={`bt-chip${focus === sym ? ' bt-chip--on' : ''}`}
              disabled={busy || isCompleted}
              onClick={() => onInstrumentChange(sym)}
            >
              {sym}
            </button>
          ))}
        </div>
        {isCompleted && <p className="bt-ws-sessionbar__hint">Instrument focus is frozen for this archive.</p>}
      </div>

      {playbooks?.length > 0 && !isCompleted && (
        <div className="bt-ws-sessionbar__playbook">
          <label className="bt-label" htmlFor="bt-ws-pb">
            Session playbook (new trades)
          </label>
          <select
            id="bt-ws-pb"
            className="bt-select"
            style={{ maxWidth: 320 }}
            value={session.playbookId || ''}
            onChange={(e) => onPlaybookChange(e.target.value)}
          >
            <option value="">No playbook</option>
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="bt-field-hint">Applies to new tickets only; each trade row keeps its own snapshot.</p>
        </div>
      )}

      <div className="bt-ws-sessionbar__actions">
        <div className="bt-ws-sessionbar__actions-primary">
          {session.status === 'active' && (
            <button type="button" className="bt-btn bt-btn--ghost" disabled={busy} onClick={onPause}>
              Pause session
            </button>
          )}
          {isPaused && (
            <button type="button" className="bt-btn bt-btn--primary" disabled={busy} onClick={onResume}>
              Resume session
            </button>
          )}
          <button type="button" className="bt-btn bt-btn--danger" disabled={busy || isCompleted} onClick={onEnd}>
            End session
          </button>
          <button type="button" className="bt-btn bt-btn--primary bt-ws-cta-trade" disabled={busy || isCompleted} onClick={onAddTrade}>
            Trade ticket
          </button>
        </div>
        <div className="bt-ws-sessionbar__actions-secondary">
          <NavLink to={`${base}/notebook`} className={navCls}>
            Notebook
          </NavLink>
          <NavLink to={`${base}/trades`} className={navCls}>
            Session trades
          </NavLink>
          <NavLink to={`${base}/reports`} className={navCls}>
            Session report
          </NavLink>
          <NavLink to={base} end className={navCls}>
            Terminal
          </NavLink>
        </div>
      </div>
      {isPaused && !isCompleted && (
        <p className="bt-ws-sessionbar__banner-muted">Session paused — resume to step replay or log trades.</p>
      )}
    </div>
  );
}

function TradeDrawer({ open, onClose, session, onSaved, initialInstrument, readOnly }) {
  const instruments = session?.instruments?.length ? session.instruments : ['EURUSD'];
  const tpl = session?.strategyContext?.confluenceTemplate || [];
  const [instrument, setInstrument] = useState(instruments[0]);
  const [direction, setDirection] = useState('long');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [pnlAmount, setPnlAmount] = useState('');
  const [initialRiskAmount, setInitialRiskAmount] = useState('');
  const [timeframe, setTimeframe] = useState(session?.replayTimeframe || 'M15');
  const [sessionLabel, setSessionLabel] = useState('London');
  const [setupName, setSetupName] = useState('');
  const [entryModel, setEntryModel] = useState(session?.strategyContext?.entryModel || '');
  const [confidenceScore, setConfidenceScore] = useState(7);
  const [bias, setBias] = useState('');
  const [marketCondition, setMarketCondition] = useState('');
  const [qualityGrade, setQualityGrade] = useState('B');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [checklistItems, setChecklistItems] = useState(() =>
    (tpl.length ? tpl : [{ key: 'trend', label: 'Trend alignment' }]).map((x) => ({ ...x, passed: false }))
  );

  const checklistSeed = JSON.stringify(session?.strategyContext?.confluenceTemplate ?? null);

  useEffect(() => {
    if (!open) return;
    const inst = session?.instruments?.length ? session.instruments : ['EURUSD'];
    const focus = initialInstrument || inst[0];
    setInstrument(focus);
    const template = session?.strategyContext?.confluenceTemplate || [];
    setChecklistItems(
      (template.length ? template : [{ key: 'trend', label: 'Trend alignment' }]).map((x) => ({ ...x, passed: false }))
    );
  }, [open, session?.id, initialInstrument, checklistSeed]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !session) return null;
  if (readOnly) return null;

  const toggleCheck = (idx) => {
    setChecklistItems((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], passed: !n[idx].passed };
      return n;
    });
  };

  const submit = async () => {
    if (entryPrice === '' || Number.isNaN(Number(entryPrice))) {
      toast.error('Entry price is required.');
      return;
    }
    if (pnlAmount === '' || Number.isNaN(Number(pnlAmount))) {
      toast.error('PnL is required for a completed backtest leg.');
      return;
    }
    try {
      const passed = checklistItems.filter((c) => c.passed).length;
      const checklistScore = checklistItems.length ? (passed / checklistItems.length) * 100 : null;
      const tagArr = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const body = {
        instrument,
        direction,
        entryPrice: Number(entryPrice),
        exitPrice: exitPrice !== '' ? Number(exitPrice) : null,
        stopLoss: stopLoss !== '' ? Number(stopLoss) : null,
        takeProfit: takeProfit !== '' ? Number(takeProfit) : null,
        openTime: openTime || null,
        closeTime: closeTime || null,
        pnlAmount: Number(pnlAmount),
        initialRiskAmount: initialRiskAmount !== '' ? Number(initialRiskAmount) : null,
        timeframe,
        sessionLabel,
        setupName: setupName || null,
        entryModel: entryModel || null,
        playbookId: session.playbookId,
        playbookName: session.playbookName,
        confidenceScore,
        bias: bias || null,
        marketCondition: marketCondition || null,
        qualityGrade,
        notes,
        tags: tagArr,
        checklistItems,
        checklistScore,
        marketType: session.marketType,
      };
      const res = await Api.createBacktestingTrade(session.id, body);
      if (res.data?.success) {
        toast.success('Trade logged');
        onSaved();
        onClose();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save trade');
    }
  };

  return (
    <>
      <div className="bt-drawer-backdrop" role="presentation" onClick={onClose} />
      <aside className="bt-drawer bt-drawer--ticket" role="dialog" aria-modal="true" aria-labelledby="bt-drawer-title">
        <div className="bt-drawer-header">
          <div>
            <h2 id="bt-drawer-title" className="aa-section-title-lg" style={{ marginBottom: 4 }}>
              <span className="aa-title-dot" />
              Execution ticket
            </h2>
            <p className="aa--muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              Log a simulated fill as you would in review: prices, risk, process checklist, then commit to the journal.
            </p>
          </div>
          <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="bt-drawer-body">
          <div className="bt-drawer-panel">
            <div className="bt-drawer-panel__head">
              <span className="bt-drawer-panel__step">1</span>
              <div>
                <div className="bt-drawer-section-title">Execution</div>
                <p className="bt-drawer-panel__hint">Instrument and direction for this leg.</p>
              </div>
            </div>
            <div className="bt-form-grid">
              <div>
                <label className="bt-label">Instrument</label>
                <select className="bt-select" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
                  {instruments.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="bt-label">Side</label>
                <div className="bt-seg" style={{ width: '100%' }}>
                  <button type="button" className={direction === 'long' ? 'on' : ''} onClick={() => setDirection('long')}>
                    Buy / Long
                  </button>
                  <button type="button" className={direction === 'short' ? 'on' : ''} onClick={() => setDirection('short')}>
                    Sell / Short
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bt-drawer-panel">
            <div className="bt-drawer-panel__head">
              <span className="bt-drawer-panel__step">2</span>
              <div>
                <div className="bt-drawer-section-title">Prices &amp; times</div>
                <p className="bt-drawer-panel__hint">Match your chart replay; times are stored in local form then normalized server-side.</p>
              </div>
            </div>
            <div className="bt-form-grid">
              <div>
                <label className="bt-label">Entry</label>
                <input className="bt-input" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Exit</label>
                <input className="bt-input" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Stop loss</label>
                <input className="bt-input" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Take profit</label>
                <input className="bt-input" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Open (local)</label>
                <input className="bt-input" type="datetime-local" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Close (local)</label>
                <input className="bt-input" type="datetime-local" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="bt-drawer-panel">
            <div className="bt-drawer-panel__head">
              <span className="bt-drawer-panel__step">3</span>
              <div>
                <div className="bt-drawer-section-title">Risk &amp; result</div>
                <p className="bt-drawer-panel__hint">PnL and risk drive R and session equity — required for a closed leg.</p>
              </div>
            </div>
            <div className="bt-form-grid">
              <div>
                <label className="bt-label">PnL (account ccy)</label>
                <input className="bt-input" value={pnlAmount} onChange={(e) => setPnlAmount(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Initial risk ($)</label>
                <input className="bt-input" value={initialRiskAmount} onChange={(e) => setInitialRiskAmount(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Session window</label>
                <select className="bt-select" value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)}>
                  {['Asia', 'London', 'New York', 'Overlap'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="bt-label">Chart timeframe</label>
                <select className="bt-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bt-drawer-panel">
            <div className="bt-drawer-panel__head">
              <span className="bt-drawer-panel__step">4</span>
              <div>
                <div className="bt-drawer-section-title">Context &amp; quality</div>
                <p className="bt-drawer-panel__hint">Feeds playbook analytics and grade discipline in reports.</p>
              </div>
            </div>
            <div className="bt-form-grid">
              <div>
                <label className="bt-label">Setup</label>
                <input className="bt-input" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Entry model</label>
                <input className="bt-input" value={entryModel} onChange={(e) => setEntryModel(e.target.value)} />
              </div>
              <div>
                <label className="bt-label">Confidence (1–10)</label>
                <input
                  className="bt-input"
                  type="number"
                  min={1}
                  max={10}
                  value={confidenceScore}
                  onChange={(e) => setConfidenceScore(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="bt-label">Quality grade</label>
                <select className="bt-select" value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)}>
                  {['A+', 'A', 'B', 'C', 'D'].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 8 }}>
                  <GradeBadge grade={qualityGrade} />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="bt-label">Bias &amp; market condition</label>
                <div className="bt-form-grid">
                  <input className="bt-input" placeholder="Bias" value={bias} onChange={(e) => setBias(e.target.value)} />
                  <input
                    className="bt-input"
                    placeholder="Market condition"
                    value={marketCondition}
                    onChange={(e) => setMarketCondition(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="bt-label">Tags</label>
                <input className="bt-input" placeholder="Comma-separated — shown as pills in trade review" value={tags} onChange={(e) => setTags(e.target.value)} />
                {tags.trim() ? (
                  <div style={{ marginTop: 8 }}>
                    <TagPills tags={tags.split(',').map((x) => x.trim()).filter(Boolean)} />
                  </div>
                ) : null}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="bt-label">Execution notes</label>
                <textarea className="bt-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you saw, what you’d change next time…" />
              </div>
            </div>
          </div>

          <div className="bt-drawer-panel">
            <div className="bt-drawer-panel__head">
              <span className="bt-drawer-panel__step">5</span>
              <div>
                <div className="bt-drawer-section-title">Confluence checklist</div>
                <p className="bt-drawer-panel__hint">Drives checklist % on this trade and correlation stats in reports.</p>
              </div>
            </div>
            {checklistItems.map((c, i) => (
              <label key={c.key || i} className="bt-check">
                <input type="checkbox" checked={c.passed} onChange={() => toggleCheck(i)} />
                {c.label || c.key}
              </label>
            ))}
          </div>

          <div className="bt-drawer-actions">
            <button type="button" className="bt-btn bt-btn--primary bt-drawer-actions__primary" onClick={submit}>
              Log trade
            </button>
            <button type="button" className="bt-btn bt-btn--ghost" onClick={onClose}>
              Discard
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function fmtIso(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function checklistTrend(trades) {
  const scored = (trades || [])
    .map((x) => Number(x.checklistScore))
    .filter((x) => Number.isFinite(x));
  if (scored.length < 4) return null;
  const half = Math.floor(scored.length / 2);
  const a = scored.slice(0, half).reduce((s, x) => s + x, 0) / half;
  const b = scored.slice(half).reduce((s, x) => s + x, 0) / (scored.length - half);
  const diff = b - a;
  if (Math.abs(diff) < 3) return { label: 'steady', diff };
  return diff > 0 ? { label: 'improving', diff } : { label: 'slipping', diff };
}

function confidenceTrend(trades) {
  const scored = (trades || [])
    .map((x) => Number(x.confidenceScore))
    .filter((x) => Number.isFinite(x));
  if (scored.length < 4) return null;
  const half = Math.floor(scored.length / 2);
  const a = scored.slice(0, half).reduce((s, x) => s + x, 0) / half;
  const b = scored.slice(half).reduce((s, x) => s + x, 0) / (scored.length - half);
  const diff = b - a;
  if (Math.abs(diff) < 0.35) return { label: 'steady', diff };
  return diff > 0 ? { label: 'rating up', diff } : { label: 'rating down', diff };
}

function RunningEdgeCard({ session, trades, metrics, chkTrend, confTrend }) {
  const lines = [];
  const m = metrics || computeRunningMetrics(trades, session?.initialBalance);
  const t = chkTrend ?? checklistTrend(trades);
  const ct = confTrend ?? confidenceTrend(trades);

  if (!m.n) {
    lines.push('Step the replay clock, then log trades — this panel updates from live PnL, checklist %, and grades.');
  } else {
    if (m.bestInstrument) lines.push(`Strongest symbol so far by avg PnL: ${m.bestInstrument}.`);
    if (m.bestSetup) lines.push(`Top setup by avg PnL: ${m.bestSetup}.`);
    if (m.winRate != null && m.winRate < 0.4) lines.push('Win rate is soft — tighten triggers before adding size.');
    if (m.profitFactor != null && m.profitFactor >= 1.4) lines.push('Profit factor looks healthy — keep risk stable.');
    if (t?.label === 'slipping') lines.push('Recent checklist scores trail earlier trades — slow the tape and re-verify confluence.');
    if (t?.label === 'improving') lines.push('Checklist adherence is improving — good process discipline.');
    if (ct?.label === 'rating down') lines.push('Self-rated confidence has dipped on recent trades — check for fatigue or overtrading.');
    if (ct?.label === 'rating up') lines.push('Confidence scores are rising with recent entries — ensure it matches actual edge.');
  }

  return (
    <div className="aa-card bt-ws-edge-card">
      <div className="bt-ws-edge-card__head">
        <div>
          <div className="aa-section-title" style={{ marginBottom: 4 }}>
            Live session edge
          </div>
          <p className="aa--muted" style={{ margin: 0, fontSize: '0.78rem' }}>
            Compact read on how this session is performing while you replay — not a full report.
          </p>
        </div>
      </div>
      {m.n === 0 ? (
        <p className="aa--muted" style={{ margin: '12px 0 0', fontSize: '0.85rem' }}>
          Stats unlock after your first logged trade.
        </p>
      ) : (
        <div className="bt-ws-edge-card__grid">
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Trades</div>
            <div className="bt-stat-value">{m.n}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Win rate</div>
            <div className="bt-stat-value">{m.winRate != null ? `${(m.winRate * 100).toFixed(0)}%` : '—'}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">PF</div>
            <div className="bt-stat-value">{m.profitFactor != null ? fmt(m.profitFactor) : '—'}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Avg R</div>
            <div className="bt-stat-value">{m.avgR != null ? fmt(m.avgR) : '—'}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Net</div>
            <div className="bt-stat-value">{fmt(m.net)}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Best setup</div>
            <div className="bt-stat-value" style={{ fontSize: '0.95rem' }}>
              {m.bestSetup || '—'}
            </div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Best inst.</div>
            <div className="bt-stat-value" style={{ fontSize: '0.95rem' }}>
              {m.bestInstrument || '—'}
            </div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Grade floor</div>
            <div className="bt-stat-value">{m.worstHabit ? <GradeBadge grade={m.worstHabit} /> : '—'}</div>
          </div>
          <div className="bt-stat-card bt-stat-card--compact">
            <div className="bt-stat-label">Chk avg</div>
            <div className="bt-stat-value">{m.checklistAvg != null ? `${m.checklistAvg.toFixed(0)}%` : '—'}</div>
          </div>
        </div>
      )}
      {(t || ct) && m.n > 0 && (
        <div className="bt-ws-edge-card__trends">
          {t && (
            <span className="aa-pill aa-pill--dim">
              Checklist trend: {t.label}
              {t.diff != null ? ` (${t.diff > 0 ? '+' : ''}${t.diff.toFixed(1)} pts)` : ''}
            </span>
          )}
          {ct && (
            <span className="aa-pill aa-pill--dim">
              Confidence trend: {ct.label}
              {ct.diff != null ? ` (${ct.diff > 0 ? '+' : ''}${ct.diff.toFixed(2)})` : ''}
            </span>
          )}
        </div>
      )}
      <ul className="bt-ws-edge-card__bullets">
        {lines.map((x, i) => (
          <li key={`${i}-${x.slice(0, 48)}`}>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotebookGlance({ sessionId, base, sessionName }) {
  const [snippet, setSnippet] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await Api.getBacktestingNotebook(sessionId);
        const n = res.data?.notebook && typeof res.data.notebook === 'object' ? res.data.notebook : {};
        const blob = [n.sessionNotes, n.worked, n.nextRefinement].filter(Boolean).join(' · ');
        if (!cancelled) setSnippet(blob.trim().slice(0, 160));
      } catch {
        if (!cancelled) setSnippet('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="aa-card bt-ws-note-glance">
      <div className="aa-section-title" style={{ marginBottom: 6 }}>
        Session notebook
      </div>
      <p className="aa--muted" style={{ margin: '0 0 10px', fontSize: '0.75rem' }}>
        Same autosaving journal as the full page — linked to <strong>{sessionName || 'this session'}</strong>.
      </p>
      {snippet ? (
        <p className="bt-ws-note-glance__snippet">{snippet}
          {snippet.length >= 160 ? '…' : ''}
        </p>
      ) : (
        <p className="aa--muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
          No notebook text yet — log what worked, what failed, and the next refinement while you trade.
        </p>
      )}
      <NavLink to={`${base}/notebook`} className="bt-btn bt-btn--primary bt-btn--sm">
        Open full notebook
      </NavLink>
    </div>
  );
}

function NotebookPanel({ sessionId, sessionName }) {
  const [notebook, setNotebook] = useState(() => defaultNotebook());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saveUi, setSaveUi] = useState('idle');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await Api.getBacktestingNotebook(sessionId);
      const n = res.data?.notebook && typeof res.data.notebook === 'object' ? res.data.notebook : {};
      setNotebook({ ...defaultNotebook(), ...n });
      setDirty(false);
    } catch {
      toast.error('Could not load notebook');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty || loading) return undefined;
    const t = setTimeout(async () => {
      setSaveUi('saving');
      try {
        await Api.putBacktestingNotebook(sessionId, notebook);
        setSaveUi('saved');
        setDirty(false);
        setTimeout(() => setSaveUi((s) => (s === 'saved' ? 'idle' : s)), 1400);
      } catch {
        setSaveUi('error');
        toast.error('Notebook save failed');
      }
    }, 850);
    return () => clearTimeout(t);
  }, [notebook, dirty, loading, sessionId]);

  const patch = (k, v) => {
    setDirty(true);
    setNotebook((p) => ({ ...p, [k]: v }));
  };

  if (loading) return <p className="bt-muted">Loading notebook…</p>;

  return (
    <div className="bt-notebook-page">
      <div className="aa-card bt-notebook-page__header">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="aa-section-title-lg" style={{ marginBottom: 6 }}>
              Session notebook
            </h2>
            <p className="aa--muted" style={{ margin: 0, fontSize: '0.82rem', maxWidth: 560 }}>
              Process journal for <strong>{sessionName || 'this session'}</strong> — separate from trade tickets. Autosaves shortly after you stop
              typing.
            </p>
          </div>
          <span className={`aa-pill ${saveUi === 'saved' ? 'aa-pill--accent' : 'aa-pill--dim'}`}>
            {saveUi === 'saving' && 'Saving…'}
            {saveUi === 'saved' && 'All changes saved'}
            {saveUi === 'error' && 'Save error — retry by editing'}
            {saveUi === 'idle' && 'Autosave ready'}
          </span>
        </div>
      </div>

      <div className="aa-card" style={{ marginTop: 14 }}>
        <div className="bt-notebook-section">
          <label className="bt-label">Session narrative</label>
          <p className="bt-field-hint">High-level story of the replay: bias, narrative, key levels you cared about.</p>
          <textarea className="bt-textarea" rows={4} value={notebook.sessionNotes} onChange={(e) => patch('sessionNotes', e.target.value)} />
        </div>

        <div className="bt-form-grid" style={{ marginTop: 18 }}>
          <div className="bt-notebook-section">
            <label className="bt-label">What worked</label>
            <p className="bt-field-hint">Rules, contexts, or behaviors that paid off.</p>
            <textarea className="bt-textarea" rows={3} value={notebook.worked} onChange={(e) => patch('worked', e.target.value)} />
          </div>
          <div className="bt-notebook-section">
            <label className="bt-label">What failed</label>
            <p className="bt-field-hint">Misses, violations, or conditions to avoid next time.</p>
            <textarea className="bt-textarea" rows={3} value={notebook.failed} onChange={(e) => patch('failed', e.target.value)} />
          </div>
        </div>

        <div className="bt-notebook-section" style={{ marginTop: 18 }}>
          <label className="bt-label">Observations</label>
          <p className="bt-field-hint">Market structure, volatility, liquidity — anything that influenced decisions.</p>
          <textarea className="bt-textarea" rows={3} value={notebook.observations} onChange={(e) => patch('observations', e.target.value)} />
        </div>

        <div className="bt-form-grid" style={{ marginTop: 18 }}>
          <div className="bt-notebook-section">
            <label className="bt-label">Lessons learned</label>
            <p className="bt-field-hint">Durable takeaways you want to carry to the next session.</p>
            <textarea className="bt-textarea" rows={3} value={notebook.lessons} onChange={(e) => patch('lessons', e.target.value)} />
          </div>
          <div className="bt-notebook-section">
            <label className="bt-label">Next refinement</label>
            <p className="bt-field-hint">One concrete adjustment for the next backtest or live prep.</p>
            <textarea className="bt-textarea" rows={3} value={notebook.nextRefinement} onChange={(e) => patch('nextRefinement', e.target.value)} />
          </div>
        </div>

        <div className="bt-notebook-section" style={{ marginTop: 18 }}>
          <label className="bt-label">Improvements (legacy)</label>
          <textarea className="bt-textarea" rows={2} value={notebook.improvements} onChange={(e) => patch('improvements', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function SessionTradesPanel({ trades, session, busy, onRefresh, instrumentFilter, onFilterChange, onDelete }) {
  const instruments = session?.instruments?.length ? session.instruments : ['EURUSD'];
  const list = trades || [];
  const rows = instrumentFilter ? list.filter((x) => x.instrument === instrumentFilter) : list;
  const emptyMsg = list.length === 0 ? 'No trades logged for this session yet.' : 'No trades match this instrument filter.';

  return (
    <div className="aa-card">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="aa-section-title" style={{ marginBottom: 4 }}>
            Trades this session
          </h2>
          <p className="aa--muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Filter by instrument; playbook snapshot stays on each row.
          </p>
        </div>
        <select className="bt-select" style={{ maxWidth: 200 }} value={instrumentFilter} onChange={(e) => onFilterChange(e.target.value)}>
          <option value="">All instruments</option>
          {instruments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="bt-table-wrap" style={{ marginTop: 14 }}>
        <table className="bt-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Inst</th>
              <th>Side</th>
              <th>Setup</th>
              <th>PnL</th>
              <th>R</th>
              <th>CHK</th>
              <th>Grade</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="bt-muted">
                  {emptyMsg}
                </td>
              </tr>
            ) : (
              rows.map((tr) => (
                <tr key={tr.id}>
                  <td>{fmtIso(tr.closeTime || tr.openTime)}</td>
                  <td>
                    <span className="aa-pill aa-pill--dim">{tr.instrument}</span>
                  </td>
                  <td>{tr.direction}</td>
                  <td>{tr.setupName || '—'}</td>
                  <td>{fmt(tr.pnlAmount)}</td>
                  <td>{tr.rMultiple != null ? fmt(tr.rMultiple) : '—'}</td>
                  <td>{tr.checklistScore != null ? `${Number(tr.checklistScore).toFixed(0)}%` : '—'}</td>
                  <td>{tr.qualityGrade || '—'}</td>
                  <td>
                    <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={busy} onClick={() => onDelete(tr)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={busy} onClick={onRefresh}>
          Refresh from server
        </button>
      </div>
    </div>
  );
}

function SessionReportsPanel({ sessionId, sessionName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await Api.getBacktestingSessionReports(sessionId);
      if (res.data?.success) setData(res.data);
      else {
        setData(null);
        setLoadError(true);
      }
    } catch {
      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="bt-muted">Building session analytics…</p>;
  const m = data?.metrics;
  const insights = data?.insights || [];

  if (loadError && !m) {
    return (
      <div className="aa-card aa-card--accent">
        <p className="aa-section-title" style={{ marginTop: 0 }}>
          Report unavailable
        </p>
        <p className="aa--muted" style={{ fontSize: '0.88rem', marginBottom: 12 }}>
          Could not load analytics for this session. Check your connection and try again.
        </p>
        <button type="button" className="bt-btn bt-btn--primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <header className="bt-page-header" style={{ marginTop: 0 }}>
        <div>
          <h1 className="bt-title">Session report</h1>
          <p className="bt-subtitle">{sessionName || 'Analytics for this session only.'}</p>
        </div>
        <button type="button" className="bt-btn bt-btn--primary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </header>

      {!m || !m.tradeCount ? (
        <div className="aa-card aa-card--accent">
          <p style={{ margin: 0 }}>No trades yet — run replay, log executions, then revisit for edge stats.</p>
        </div>
      ) : (
        <>
          <div className="bt-stat-grid">
            <div className="bt-stat-card">
              <div className="bt-stat-label">Trades</div>
              <div className="bt-stat-value">{m.tradeCount}</div>
            </div>
            <div className="bt-stat-card">
              <div className="bt-stat-label">Net PnL</div>
              <div className="bt-stat-value">{fmt(m.netPnl)}</div>
            </div>
            <div className="bt-stat-card">
              <div className="bt-stat-label">Win rate</div>
              <div className="bt-stat-value">{m.winRate != null ? `${(m.winRate * 100).toFixed(1)}%` : '—'}</div>
            </div>
            <div className="bt-stat-card">
              <div className="bt-stat-label">Profit factor</div>
              <div className="bt-stat-value">{fmt(m.profitFactor)}</div>
            </div>
            <div className="bt-stat-card">
              <div className="bt-stat-label">Expectancy</div>
              <div className="bt-stat-value">{fmt(m.expectancy)}</div>
            </div>
            <div className="bt-stat-card">
              <div className="bt-stat-label">Max DD</div>
              <div className="bt-stat-value">{fmt(m.maxDrawdown)}</div>
            </div>
          </div>

          {insights.length > 0 && (
            <div className="aa-card" style={{ marginTop: 16 }}>
              <div className="aa-section-title" style={{ marginBottom: 8 }}>
                Deterministic insights
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.88rem', color: 'var(--aa-muted, rgba(255,255,255,0.65))' }}>
                {insights.map((x) => (
                  <li key={x} style={{ marginBottom: 8 }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EndSessionModal({ open, onClose, session, trades, onConfirm, busy }) {
  if (!open || !session) return null;
  const m = computeRunningMetrics(trades, session.initialBalance);
  return (
    <div className="bt-modal-overlay" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="bt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bt-end-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bt-end-title" className="aa-section-title-lg" style={{ marginTop: 0 }}>
          End this session?
        </h2>
        <p className="aa--muted" style={{ fontSize: '0.88rem' }}>
          We will freeze replay state, lock new trades, and store a completion recap. Your notebook entries and session report stay available anytime.
        </p>
        <div className="bt-stat-grid" style={{ marginTop: 12 }}>
          <div className="bt-stat-card">
            <div className="bt-stat-label">Trades logged</div>
            <div className="bt-stat-value">{m.n}</div>
          </div>
          <div className="bt-stat-card">
            <div className="bt-stat-label">Win rate</div>
            <div className="bt-stat-value">{m.winRate != null ? `${(m.winRate * 100).toFixed(0)}%` : '—'}</div>
          </div>
          <div className="bt-stat-card">
            <div className="bt-stat-label">Net PnL</div>
            <div className="bt-stat-value">{fmt(m.net)}</div>
          </div>
          <div className="bt-stat-card">
            <div className="bt-stat-label">Profit factor</div>
            <div className="bt-stat-value">{m.profitFactor != null ? fmt(m.profitFactor) : '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" className="bt-btn bt-btn--ghost" disabled={busy} onClick={onClose}>
            Keep working
          </button>
          <button type="button" className="bt-btn bt-btn--danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Completing…' : 'Confirm end session'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionCompletionRecap({ recap, session, onDismiss }) {
  if (!recap || !session) return null;
  return (
    <div className="aa-card aa-card--accent" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="aa-section-title-lg" style={{ marginBottom: 6 }}>
            Session complete — {session.sessionName}
          </h2>
          <p className="aa--muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Recap is saved on the session. Open <strong>Session report</strong> or global Reports for deeper cuts.
          </p>
        </div>
        <button type="button" className="bt-btn bt-btn--primary" onClick={onDismiss}>
          Continue in workspace
        </button>
      </div>
      <div className="bt-stat-grid" style={{ marginTop: 14 }}>
        {recap.headline && (
          <div className="bt-stat-card" style={{ gridColumn: '1 / -1' }}>
            <div className="bt-stat-label">Result</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {recap.headline}
            </div>
          </div>
        )}
        {recap.bestInstrument && (
          <div className="bt-stat-card">
            <div className="bt-stat-label">Best instrument</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {recap.bestInstrument}
            </div>
          </div>
        )}
        {recap.bestSetup && (
          <div className="bt-stat-card">
            <div className="bt-stat-label">Best setup</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {recap.bestSetup}
            </div>
          </div>
        )}
        {recap.bestSession && (
          <div className="bt-stat-card">
            <div className="bt-stat-label">Best session window</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {recap.bestSession}
            </div>
          </div>
        )}
        {recap.weakestSetup && (
          <div className="bt-stat-card">
            <div className="bt-stat-label">Weakest setup</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {typeof recap.weakestSetup === 'object' ? recap.weakestSetup.name : recap.weakestSetup}
            </div>
          </div>
        )}
        {recap.worstHabit && (
          <div className="bt-stat-card">
            <div className="bt-stat-label">Focus next</div>
            <div className="bt-stat-value" style={{ fontSize: '1rem' }}>
              {recap.worstHabit}
            </div>
          </div>
        )}
        {recap.checklistNote && (
          <div className="bt-stat-card" style={{ gridColumn: '1 / -1' }}>
            <div className="bt-stat-label">Checklist vs outcome</div>
            <div className="bt-stat-value" style={{ fontSize: '0.95rem' }}>
              {recap.checklistNote}
            </div>
          </div>
        )}
        {recap.nextFocus && (
          <div className="bt-stat-card" style={{ gridColumn: '1 / -1' }}>
            <div className="bt-stat-label">Recommended next focus</div>
            <div className="bt-stat-value" style={{ fontSize: '0.95rem' }}>
              {recap.nextFocus}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BacktestingWorkspace() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/backtesting/session/${sessionId}`;

  const [session, setSession] = useState(null);
  const [trades, setTrades] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState('');
  const [liveRecap, setLiveRecap] = useState(location.state?.recap || null);

  const refreshSession = useCallback(async () => {
    const res = await Api.getBacktestingSession(sessionId);
    if (res.data?.success) setSession(res.data.session);
  }, [sessionId]);

  const refreshTrades = useCallback(async () => {
    const res = await Api.getBacktestingSessionTrades(sessionId);
    if (res.data?.success) setTrades(res.data.trades || []);
  }, [sessionId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSession(), refreshTrades()]);
  }, [refreshSession, refreshTrades]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await refreshAll();
        const pr = await Api.getTraderPlaybookSetups();
        const list = pr.data?.setups || [];
        setPlaybooks(Array.isArray(list) ? list : []);
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, refreshAll]);

  const metrics = useMemo(() => computeRunningMetrics(trades, session?.initialBalance), [trades, session?.initialBalance]);
  const trend = useMemo(() => checklistTrend(trades), [trades]);
  const confTrend = useMemo(() => confidenceTrend(trades), [trades]);
  const replayAtLabel = useMemo(
    () =>
      session
        ? fmtIso(session.lastReplayAt || (session.dateStart ? `${session.dateStart}T00:00:00.000Z` : null))
        : '—',
    [session]
  );

  const activeInstrument = useMemo(() => {
    if (!session) return null;
    const list = session.instruments?.length ? session.instruments : ['EURUSD'];
    return session.lastActiveInstrument && list.includes(session.lastActiveInstrument)
      ? session.lastActiveInstrument
      : list[0];
  }, [session]);

  const onInstrumentChange = async (sym) => {
    if (!session || busy || session.status === 'completed') return;
    setBusy(true);
    try {
      await Api.patchBacktestingSession(session.id, { lastActiveInstrument: sym });
      await refreshSession();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not update instrument');
    } finally {
      setBusy(false);
    }
  };

  const onPlaybookChange = async (pid) => {
    if (!session || busy || session.status === 'completed') return;
    const p = playbooks.find((x) => x.id === pid);
    setBusy(true);
    try {
      await Api.patchBacktestingSession(session.id, {
        playbookId: pid || null,
        playbookName: p?.name || null,
      });
      await refreshSession();
      toast.success('Playbook updated for this session');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not update playbook');
    } finally {
      setBusy(false);
    }
  };

  const onPause = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await Api.pauseBacktestingSession(session.id, { timeDeltaSeconds: 0 });
      await refreshSession();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Pause failed');
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await Api.resumeBacktestingSession(session.id);
      await refreshSession();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Resume failed');
    } finally {
      setBusy(false);
    }
  };

  const persistReplay = async (nextIso) => {
    if (!session) return;
    await Api.patchBacktestingSession(session.id, { lastReplayAt: nextIso });
    await refreshSession();
  };

  const onReplaySpeedChange = async (spd) => {
    if (!session || busy || session.status === 'completed') return;
    setBusy(true);
    try {
      await Api.patchBacktestingSession(session.id, { replaySpeed: spd });
      await refreshSession();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not update replay speed');
    } finally {
      setBusy(false);
    }
  };

  const onReplayStep = async (steps) => {
    if (!session || busy || session.status === 'completed' || session.status === 'paused') return;
    setBusy(true);
    try {
      const tf = session.replayTimeframe || 'M15';
      const anchor =
        session.lastReplayAt || (session.dateStart ? `${session.dateStart}T00:00:00.000Z` : new Date().toISOString());
      const next = stepReplayTime(anchor, tf, steps);
      await persistReplay(next);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not step replay');
    } finally {
      setBusy(false);
    }
  };

  const onReplayJump = async (bars) => onReplayStep(bars);

  const confirmEndSession = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await Api.completeBacktestingSession(session.id);
      const recap = res.data?.recap ?? null;
      await refreshAll();
      setEndOpen(false);
      setLiveRecap(recap);
      navigate(base, { replace: true, state: { recap } });
      toast.success('Session completed');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not complete session');
    } finally {
      setBusy(false);
    }
  };

  const dismissRecap = () => {
    setLiveRecap(null);
    navigate(base, { replace: true, state: {} });
  };

  const removeTrade = async (tr) => {
    if (!tr?.id || !window.confirm('Remove this trade from the session?')) return;
    setBusy(true);
    try {
      await Api.deleteBacktestingTrade(tr.id);
      await refreshAll();
      toast.success('Trade removed');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !session) {
    return <p className="bt-muted">{loading ? 'Loading workspace…' : 'Session not found.'}</p>;
  }

  if (session.status === 'draft') {
    return (
      <div className="aa-card aa-card--accent">
        <h2 className="aa-section-title">Draft session</h2>
        <p className="aa--muted" style={{ fontSize: '0.9rem' }}>
          Finish setup in the wizard before using the workspace.
        </p>
        <button type="button" className="bt-btn bt-btn--primary" onClick={() => navigate(`/backtesting/new?draft=${session.id}`)}>
          Continue draft
        </button>
      </div>
    );
  }

  const showRecapBanner = !!liveRecap && session.status === 'completed';

  return (
    <>
      {showRecapBanner && <SessionCompletionRecap recap={liveRecap} session={session} onDismiss={dismissRecap} />}

      <SessionBar
        session={session}
        base={base}
        busy={busy}
        playbooks={playbooks}
        onPlaybookChange={onPlaybookChange}
        onPause={onPause}
        onResume={onResume}
        onEnd={() => setEndOpen(true)}
        onAddTrade={() => setDrawerOpen(true)}
        activeInstrument={activeInstrument}
        onInstrumentChange={onInstrumentChange}
        replayAtLabel={replayAtLabel}
        runningMetrics={metrics}
      />

      <Routes>
        <Route
          index
          element={
            <div className="bt-ws-main">
              <div className="bt-ws-main__primary">
                <BacktestingWorkspaceChartStage
                  session={session}
                  activeInstrument={activeInstrument}
                  replayAtLabel={replayAtLabel}
                  busy={busy}
                  onStep={onReplayStep}
                  onJump={onReplayJump}
                  onSpeedChange={onReplaySpeedChange}
                  steppingLocked={session.status === 'paused'}
                />
                <RunningEdgeCard session={session} trades={trades} metrics={metrics} chkTrend={trend} confTrend={confTrend} />
              </div>
              <aside className="bt-ws-main__rail">
                <NotebookGlance sessionId={sessionId} base={base} sessionName={session.sessionName} />
              </aside>
            </div>
          }
        />
        <Route path="notebook" element={<NotebookPanel sessionId={sessionId} sessionName={session.sessionName} />} />
        <Route
          path="trades"
          element={
            <SessionTradesPanel
              trades={trades}
              session={session}
              busy={busy}
              onRefresh={refreshAll}
              instrumentFilter={instrumentFilter}
              onFilterChange={setInstrumentFilter}
              onDelete={removeTrade}
            />
          }
        />
        <Route path="reports" element={<SessionReportsPanel sessionId={sessionId} sessionName={session.sessionName} />} />
      </Routes>

      <TradeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        initialInstrument={activeInstrument}
        onSaved={refreshAll}
        readOnly={session.status === 'completed'}
      />

      <EndSessionModal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        session={session}
        trades={trades}
        onConfirm={confirmEndSession}
        busy={busy}
      />
    </>
  );
}
