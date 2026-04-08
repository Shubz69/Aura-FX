import React, { useMemo } from 'react';
import BacktestingTradingViewChart from './BacktestingTradingViewChart';

export { default as BacktestingChartPlaceholder } from './BacktestingChartPlaceholder';

/**
 * Serializable snapshot for a future embedded chart provider (TradingView, Lightweight Charts, etc.).
 * Hooks like onStepReplay / onJumpReplay stay on the workspace; the provider reads state and optionally emits UI events only.
 *
 * @typedef {Object} BacktestingChartBridgeState
 * @property {string|null} sessionId
 * @property {string} symbol
 * @property {string} timeframe
 * @property {string|null} replayTimestampIso
 * @property {string} replayGranularity
 * @property {number} replaySpeed
 * @property {string|null} sessionStatus — active | paused | completed | draft
 * @property {string|null} marketType
 * @property {string|null} tradingHoursMode
 * @property {string|null} riskModel
 * @property {number|string|null} riskPercent
 * @property {string|null} dateStart
 * @property {string|null} dateEnd
 * @property {string|null} playbookId
 * @property {string|null} playbookName
 * @property {string|null} objective
 * @property {string|null} objectiveDetail
 */

const OBJECTIVE_LABELS = {
  playbook: 'Playbook',
  entry_model: 'Entry model',
  time_edge: 'Time edge',
  instrument: 'Instrument',
  risk_model: 'Risk model',
  market_conditions: 'Conditions',
};

const RISK_MODEL_LABELS = {
  fixed_lot: 'Fixed lot',
  fixed_percent: 'Fixed %',
  manual: 'Manual / trade',
};

const HOURS_LABELS = {
  regular: 'Regular hours',
  extended: 'Extended',
  all: 'All hours',
};

function resolveSymbol(session, activeInstrument) {
  const list = session?.instruments?.length ? session.instruments : ['EURUSD'];
  const focus =
    activeInstrument && list.includes(activeInstrument)
      ? activeInstrument
      : session?.lastActiveInstrument && list.includes(session.lastActiveInstrument)
        ? session.lastActiveInstrument
        : list[0];
  return focus || '—';
}

/**
 * Build the object a chart SDK adapter should subscribe to (session refresh replaces identity).
 * @param {object|null} session
 * @param {string|null} activeInstrument
 * @returns {BacktestingChartBridgeState}
 */
export function buildBacktestingChartBridgeState(session, activeInstrument) {
  const symbol = session ? resolveSymbol(session, activeInstrument) : '—';
  return {
    sessionId: session?.id ?? null,
    symbol,
    timeframe: session?.replayTimeframe || 'M15',
    replayTimestampIso: session?.lastReplayAt || (session?.dateStart ? `${session.dateStart}T00:00:00.000Z` : null),
    replayGranularity: session?.replayGranularity || 'candle',
    replaySpeed: session?.replaySpeed != null ? Number(session.replaySpeed) : 1,
    sessionStatus: session?.status ?? null,
    marketType: session?.marketType ?? null,
    tradingHoursMode: session?.tradingHoursMode ?? null,
    riskModel: session?.riskModel ?? null,
    riskPercent: session?.riskPercent ?? null,
    dateStart: session?.dateStart ?? null,
    dateEnd: session?.dateEnd ?? null,
    playbookId: session?.playbookId ?? null,
    playbookName: session?.playbookName ?? null,
    objective: session?.objective ?? null,
    objectiveDetail: session?.objectiveDetail ?? null,
  };
}

function replayStatusPresentation(session) {
  if (!session) return { label: '—', tone: 'dim' };
  if (session.status === 'completed') return { label: 'Archived', tone: 'archived' };
  if (session.status === 'paused') return { label: 'Paused', tone: 'paused' };
  return { label: 'Live stepping', tone: 'live' };
}

function ContextChip({ k, v }) {
  if (v == null || v === '') return null;
  return (
    <div className="bt-chart-stage__ctx-chip">
      <span className="bt-chart-stage__ctx-k">{k}</span>
      <span className="bt-chart-stage__ctx-v">{v}</span>
    </div>
  );
}

function SessionContextStrip({ session, activeInstrument }) {
  if (!session) return null;
  const sym = resolveSymbol(session, activeInstrument);
  const objLabel = session.objective ? OBJECTIVE_LABELS[session.objective] || session.objective : null;
  const risk =
    session.riskModel != null
      ? [RISK_MODEL_LABELS[session.riskModel] || session.riskModel, session.riskPercent != null ? `${session.riskPercent}%` : null]
          .filter(Boolean)
          .join(' · ')
      : null;
  const hours = session.tradingHoursMode ? HOURS_LABELS[session.tradingHoursMode] || session.tradingHoursMode : null;
  const range =
    session.dateStart || session.dateEnd
      ? [session.dateStart || '…', session.dateEnd || '…'].join(' → ')
      : null;

  return (
    <div className="bt-chart-stage__context" aria-label="Session test context">
      <ContextChip k="Symbol" v={sym} />
      <ContextChip k="Market" v={session.marketType} />
      <ContextChip k="Range" v={range} />
      <ContextChip k="Objective" v={objLabel} />
      <ContextChip k="Playbook" v={session.playbookName} />
      <ContextChip k="Risk" v={risk} />
      <ContextChip k="Hours" v={hours} />
    </div>
  );
}

function ChartStageReplayTransport({ session, busy, onStep, onJump, onSpeedChange, steppingLocked }) {
  if (!session) return null;
  const tf = session.replayTimeframe || 'M15';
  const gr = session.replayGranularity || 'candle';
  const completed = session.status === 'completed';
  const speed = session.replaySpeed != null ? Number(session.replaySpeed) : 1;
  const lock = steppingLocked || completed;

  return (
    <div className={`bt-chart-stage__replay${completed ? ' bt-chart-stage__replay--locked' : ''}`}>
      {completed && (
        <div className="bt-ws-replay__archived" role="status">
          Archived session — replay stepping is off. Notebook, trades list, and session report stay open for review.
        </div>
      )}

      {!completed && session.status === 'paused' && (
        <div className="bt-ws-replay__paused" role="status">
          Session paused — resume from the control bar to move the replay clock or open new tickets.
        </div>
      )}

      <div className="bt-ws-replay__controls">
        <div className="bt-ws-replay__cluster">
          <span className="bt-ws-replay__cluster-label">Cadence</span>
          <span className="aa-pill aa-pill--accent">
            {tf} · {gr}
          </span>
          <label className="bt-ws-replay__speed">
            <span className="aa--dim" style={{ fontSize: '0.62rem', marginRight: 8 }}>
              Speed
            </span>
            <select
              className="bt-select bt-select--inline"
              value={String(speed)}
              disabled={busy || completed}
              onChange={(e) => onSpeedChange?.(Number(e.target.value))}
            >
              {[0.5, 1, 1.5, 2, 3].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="bt-ws-replay__cluster">
          <span className="bt-ws-replay__cluster-label">Step</span>
          <div className="bt-replay-actions">
            <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={busy || lock} onClick={() => onJump(-10)}>
              −10
            </button>
            <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={busy || lock} onClick={() => onStep(-1)}>
              −1 bar
            </button>
            <button type="button" className="bt-btn bt-btn--primary bt-btn--sm" disabled={busy || lock} onClick={() => onStep(1)}>
              +1 bar
            </button>
            <button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" disabled={busy || lock} onClick={() => onJump(10)}>
              +10
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Primary visual stage for backtesting: header, session context, chart mount slot, replay transport.
 * Pass chartMount when a provider is wired; otherwise the premium placeholder is shown.
 *
 * @param {object} props
 * @param {object|null} props.session
 * @param {string|null} props.activeInstrument
 * @param {string} props.replayAtLabel — formatted replay timestamp for display
 * @param {boolean} props.busy
 * @param {(steps: number) => void} props.onStep
 * @param {(bars: number) => void} props.onJump
 * @param {(speed: number) => void} [props.onSpeedChange]
 * @param {boolean} [props.steppingLocked]
 * @param {React.ReactNode} [props.chartMount] — if set, replaces the default TradingView embed (bridge-driven BacktestingTradingViewChart)
 */
export function BacktestingWorkspaceChartStage({
  session,
  activeInstrument,
  replayAtLabel,
  busy,
  onStep,
  onJump,
  onSpeedChange,
  steppingLocked,
  chartMount,
}) {
  const bridge = useMemo(() => buildBacktestingChartBridgeState(session, activeInstrument), [session, activeInstrument]);
  const status = replayStatusPresentation(session);
  const tf = session?.replayTimeframe || 'M15';

  if (!session) return null;

  return (
    <section
      className="bt-chart-stage aa-card"
      aria-label="Backtesting chart stage"
      data-bt-chart-ready="true"
      data-bt-session-status={bridge.sessionStatus || ''}
    >
      <header className="bt-chart-stage__header">
        <div className="bt-chart-stage__header-main">
          <span className="bt-chart-stage__kicker">Replay surface</span>
          <h2 className="bt-chart-stage__title">Chart stage</h2>
          <div className="bt-chart-stage__header-meta">
            <span className="aa-pill aa-pill--accent">{bridge.symbol}</span>
            <span className="aa-pill aa-pill--dim">{tf}</span>
          </div>
        </div>
        <div className="bt-chart-stage__header-status">
          <span className={`bt-chart-stage__status bt-chart-stage__status--${status.tone}`}>{status.label}</span>
          <div className="bt-chart-stage__clock">
            <span className="bt-chart-stage__clock-label">Simulated time</span>
            <span className="bt-chart-stage__clock-value">{replayAtLabel}</span>
          </div>
        </div>
      </header>

      <SessionContextStrip session={session} activeInstrument={activeInstrument} />

      <div className="bt-chart-stage__body">
        <div className="bt-chart-stage__mount" data-bt-chart-mount id="bt-backtesting-chart-mount" role="region" aria-label="Chart provider mount">
          {chartMount || (
            <BacktestingTradingViewChart bridge={bridge} session={session} replayAtLabel={replayAtLabel} />
          )}
        </div>
      </div>

      <ChartStageReplayTransport
        session={session}
        busy={busy}
        onStep={onStep}
        onJump={onJump}
        onSpeedChange={onSpeedChange}
        steppingLocked={steppingLocked}
      />

      <p className="bt-chart-stage__footer-hint">
        Transport controls update session replay time. Execution logging, notebook, and reports are unchanged when a chart provider is connected.
      </p>
    </section>
  );
}

export default BacktestingWorkspaceChartStage;
