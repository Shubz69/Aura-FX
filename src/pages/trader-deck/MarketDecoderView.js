import React, { useState, useCallback, useEffect, useRef } from 'react';
import Api from '../../services/Api';
import MarketDecoderChart from './MarketDecoderChart';
import '../../styles/trader-deck/MarketDecoder.css';

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];
/** Background refresh interval while a brief is shown (server still enforces MARKET_DECODER_CACHE_SEC unless refresh=1). */
const LIVE_POLL_MS = Math.max(15000, parseInt(process.env.REACT_APP_MARKET_DECODER_POLL_MS || '30000', 10) || 30000);

function formatGeneratedAt(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(11, 19);
  }
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) {
    return 'Session % pending — quote snapshot incomplete';
  }
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatLevel(v, marketType) {
  if (v == null || Number.isNaN(Number(v))) {
    return 'Not available from loaded series';
  }
  const n = Number(v);
  if (marketType === 'FX' || marketType === 'Commodity') return n.toFixed(5);
  if (marketType === 'Crypto' && n > 200) return n.toFixed(2);
  return n.toFixed(n < 50 ? 4 : 2);
}

function MiniSparkline({ values }) {
  if (!values || values.length < 2) return null;
  const w = 200;
  const h = 48;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="md-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke="rgba(212,175,55,0.85)" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function biasPillClass(bias) {
  const b = (bias || '').toLowerCase();
  if (b === 'bullish') return 'md-decoder-pill md-decoder-pill--bull';
  if (b === 'bearish') return 'md-decoder-pill md-decoder-pill--bear';
  return 'md-decoder-pill md-decoder-pill--neutral';
}

function formatNewsTime(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 19);
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(0, 16);
  }
}

function postureToneClass(posture) {
  const text = String(posture || '').toLowerCase();
  if (text.includes('bull')) return 'md-tone md-tone--bull';
  if (text.includes('bear')) return 'md-tone md-tone--bear';
  if (text.includes('wait') || text.includes('neutral') || text.includes('stand')) return 'md-tone md-tone--neutral';
  return 'md-tone';
}

const DECODER_FLOW = [
  {
    step: '1',
    title: 'Read the brief',
    note: 'Start with bias, conviction, and current posture.',
  },
  {
    step: '2',
    title: 'Inspect structure',
    note: 'Use price action, levels, and scenario map.',
  },
  {
    step: '3',
    title: 'Check risk context',
    note: 'Review macro calendar, headlines, and positioning.',
  },
  {
    step: '4',
    title: 'Decide execution',
    note: 'Only act if the posture and trigger still align.',
  },
];

export default function MarketDecoderView({ embedded }) {
  const [q, setQ] = useState('EURUSD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  /** Symbol for the brief currently on screen (not the input draft). */
  const [activeSymbol, setActiveSymbol] = useState(null);
  const activeSymbolRef = useRef(null);
  activeSymbolRef.current = activeSymbol;

  const run = useCallback(async (symbol, refresh = false, silent = false) => {
    const sym = String(symbol || '').trim();
    if (!sym) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    } else {
      setLiveRefreshing(true);
    }
    try {
      const res = await Api.getTraderDeckMarketDecoder(sym, { refresh });
      const data = res.data;
      if (!data.success) {
        if (!silent) {
          setError(data.message || 'Could not decode this symbol.');
          setBrief(null);
        }
        return;
      }
      setBrief(data.brief);
      setCached(Boolean(data.cached));
      setActiveSymbol(sym);
    } catch (e) {
      if (!silent) {
        setError(e?.response?.data?.message || e.message || 'Request failed');
        setBrief(null);
      }
    } finally {
      if (!silent) setLoading(false);
      else setLiveRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!brief || !activeSymbol) return undefined;
    const id = setInterval(() => {
      const sym = activeSymbolRef.current;
      if (sym) run(sym, true, true);
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [brief, activeSymbol, run]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const sym = activeSymbolRef.current;
      if (sym && brief) run(sym, true, true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [brief, run]);

  const onSubmit = (e) => {
    e.preventDefault();
    run(q, true);
  };

  const mt = brief?.header?.marketType || 'FX';

  return (
    <div className={`md-decoder ${embedded ? 'md-decoder--embedded' : ''}`}>
      <header className="md-decoder-hero">
        <div className="md-decoder-hero-grid">
          <div className="md-decoder-hero-main">
            <p className="md-decoder-hero-eyebrow">Aura Terminal</p>
            <h2 className="md-decoder-hero-title">Market Decoder</h2>
            <p className="md-decoder-hero-sub">
              Rules-first decision brief per asset, designed to feel like an institutional desk handoff. Generate bias,
              levels, scenarios, and execution context in one focused front-end view.
            </p>
            <form className="md-decoder-search" onSubmit={onSubmit} autoComplete="off">
              <input
                className="md-decoder-input"
                value={q}
                onChange={(e) => setQ(e.target.value.toUpperCase())}
                placeholder="Symbol (e.g. EURUSD, XAUUSD, BTCUSD, SPY)"
                aria-label="Asset symbol"
              />
              <button type="submit" className="md-decoder-submit" disabled={loading}>
                {loading ? 'Decoding…' : 'Decode'}
              </button>
            </form>
            <div className="md-decoder-chips" role="group" aria-label="Quick symbols">
              {QUICK.map((s) => (
                <button key={s} type="button" className="md-decoder-chip" onClick={() => { setQ(s); run(s, true); }}>
                  {s}
                </button>
              ))}
            </div>
            <div className="md-decoder-flow" aria-label="Decoder workflow">
              {DECODER_FLOW.map((item) => (
                <div key={item.step} className="md-decoder-flow-step">
                  <span className="md-decoder-flow-index">{item.step}</span>
                  <span className="md-decoder-flow-copy">
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <aside className="md-decoder-hero-rail">
            <div className="md-hero-rail-card">
              <span className="md-hero-rail-label">What this page is for</span>
              <strong>Turn scattered market context into one usable pre-trade brief, not a signal feed.</strong>
            </div>
            <div className="md-hero-rail-card">
              <span className="md-hero-rail-label">Best use</span>
              <strong>Filter the asset, read the posture, check risks, then decide whether execution is justified.</strong>
            </div>
          </aside>
        </div>

        {cached && brief && (
          <p className="md-decoder-meta">Served from cache — decode again for a fresh pull.</p>
        )}
        {brief && (
          <p className="md-decoder-live" role="status">
            <span className="md-decoder-live-dot" aria-hidden />
            Live refresh every {Math.round(LIVE_POLL_MS / 1000)}s
            {formatGeneratedAt(brief.meta?.generatedAt) ? (
              <span className="md-decoder-live-time"> · Last updated {formatGeneratedAt(brief.meta.generatedAt)}</span>
            ) : null}
            {liveRefreshing ? <span className="md-decoder-live-sync"> · Updating…</span> : null}
          </p>
        )}
      </header>

      {error && (
        <div className="md-decoder-error" role="alert">
          {error}
        </div>
      )}

      {brief && (
        <div className="md-decoder-stack">
          <section className="md-decoder-summary-band" aria-label="Decoder summary">
            <div className="md-summary-item">
              <span className="md-summary-label">Bias</span>
              <span className={biasPillClass(brief.instantRead?.bias || brief.marketPulse?.biasLabel)}>
                {brief.instantRead?.bias || brief.marketPulse?.biasLabel || 'Neutral'}
              </span>
            </div>
            <div className="md-summary-item">
              <span className="md-summary-label">Conviction</span>
              <strong className="md-summary-value">{brief.instantRead?.conviction || brief.marketPulse?.tradeReadiness || 'Pending'}</strong>
            </div>
            <div className="md-summary-item">
              <span className="md-summary-label">Condition</span>
              <strong className="md-summary-value">{brief.instantRead?.tradingCondition || brief.marketPulse?.marketState || 'Monitoring'}</strong>
            </div>
            <div className="md-summary-item">
              <span className="md-summary-label">Posture</span>
              <strong className={postureToneClass(brief.finalOutput?.currentPosture)}>{brief.finalOutput?.currentPosture || 'No posture yet'}</strong>
            </div>
          </section>

          <section className="md-decoder-decision-strip" aria-label="Decision strip">
            <div className="md-decision-card md-decision-card--primary">
              <span className="md-decision-label">Current desk posture</span>
              <strong className={postureToneClass(brief.finalOutput?.currentPosture)}>
                {brief.finalOutput?.currentPosture || 'No posture yet'}
              </strong>
              <p>
                {brief.finalOutput?.postureSubtitle || brief.instantRead?.bestApproach || 'Wait for the structure to become clearer before acting.'}
              </p>
            </div>
            <div className="md-decision-card">
              <span className="md-decision-label">Best approach right now</span>
              <p>{brief.instantRead?.bestApproach || 'Assess bias, levels, and scenario before planning execution.'}</p>
            </div>
            <div className="md-decision-card">
              <span className="md-decision-label">What changes the read</span>
              <p>{brief.finalOutput?.whatWouldChangeThis || 'A break in structure, macro catalyst, or invalidation around key levels.'}</p>
            </div>
          </section>

          <div className="md-decoder-top-grid md-terminal-split">
            <section className="md-decoder-card md-terminal-instrument" aria-labelledby="md-h-header">
              <h3 id="md-h-header" className="md-decoder-card-title md-terminal-title">
                Instrument
              </h3>
              <div className="md-terminal-headline">
                <span className="md-terminal-symbol">{brief.header.asset}</span>
                <span className="md-terminal-type">{brief.header.marketType}</span>
              </div>
              <div className="md-terminal-price-row">
                <div>
                  <span className="md-terminal-eyebrow">Last</span>
                  <span className="md-terminal-price">{formatLevel(brief.header.price, mt)}</span>
                </div>
                <div>
                  <span className="md-terminal-eyebrow">Session</span>
                  <span className={`md-terminal-chg ${brief.header.changePercent >= 0 ? 'md-terminal-chg--up' : 'md-terminal-chg--down'}`}>
                    {formatPct(brief.header.changePercent)}
                  </span>
                </div>
              </div>
              {brief.header.whatChanged && (
                <p className="md-terminal-what-changed">{brief.header.whatChanged}</p>
              )}
              {brief.meta?.sparkline?.length > 2 && (
                <div className="md-terminal-spark-wrap">
                  <span className="md-terminal-eyebrow">Recent closes (last {brief.meta.sparkline.length})</span>
                  <MiniSparkline values={brief.meta.sparkline} />
                </div>
              )}
            </section>

            {brief.marketPulse && (
              <section className="md-decoder-card md-decoder-card--pulse md-terminal-pulse" aria-labelledby="md-h-pulse">
                <h3 id="md-h-pulse" className="md-decoder-card-title md-terminal-title">
                  Market pulse
                </h3>
                <div className="md-pulse-gauge-wrap">
                  <div className="md-pulse-gauge" aria-hidden>
                    <div className="md-pulse-gauge-track">
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--bear">Bearish</span>
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--mid">Neutral</span>
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--bull">Bullish</span>
                    </div>
                    <div
                      className="md-pulse-needle"
                      style={{
                        transform: `rotate(${-90 + (Number(brief.marketPulse.gaugePosition) / 100) * 180}deg)`,
                      }}
                    />
                  </div>
                  <p className="md-pulse-bias-line">
                    Bias: <strong>{brief.marketPulse.biasLabel}</strong>
                  </p>
                </div>
                {brief.marketPulse.convictionExplanation && (
                  <p className="md-pulse-conviction">{brief.marketPulse.convictionExplanation}</p>
                )}
                <ul className="md-pulse-stats">
                  <li>
                    <span className="md-pulse-stat-label">Momentum</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.momentum}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Volatility</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.volatility}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Market state</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.marketState}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Decision pressure</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.decisionPressure}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Trade readiness</span>
                    <span className="md-pulse-stat-val md-pulse-stat-val--gold">
                      {brief.marketPulse.tradeReadiness} / 10
                    </span>
                  </li>
                </ul>
                {brief.marketPulse.environmentLine && (
                  <p className="md-pulse-environment">{brief.marketPulse.environmentLine}</p>
                )}
              </section>
            )}
          </div>

          <section className="md-decoder-card md-decoder-card--chart" aria-labelledby="md-h-chart">
            <div className="md-decoder-card-head">
              <div>
                <h3 id="md-h-chart" className="md-decoder-card-title md-terminal-title">
                  Price action
                </h3>
                <p className="md-chart-lede md-decoder-small">
                  Daily OHLC aligned with this brief, with quick mode switching so the market structure is easier to read.
                </p>
              </div>
              <span className="md-chart-badge">Aligned with brief</span>
            </div>
            <MarketDecoderChart bars={brief.meta?.chartBars} />
          </section>

          <div className="md-decoder-workspace">
            <div className="md-decoder-primary">
              <section className="md-decoder-card md-decoder-card--instant" aria-labelledby="md-h-instant">
                <div className="md-decoder-card-head">
                  <div>
                    <h3 id="md-h-instant" className="md-decoder-card-title">
                      Decision brief
                    </h3>
                    <p className="md-decoder-small md-card-caption">This is the fast read a trader should understand first before going deeper.</p>
                  </div>
                </div>
                <div className="md-decoder-instant-grid">
                  <div className="md-decoder-kv">
                    <span className="md-decoder-kv-label">Bias</span>
                    <span className={biasPillClass(brief.instantRead.bias)}>{brief.instantRead.bias}</span>
                  </div>
                  <div className="md-decoder-kv">
                    <span className="md-decoder-kv-label">Conviction</span>
                    <span className="md-decoder-kv-value">{brief.instantRead.conviction}</span>
                  </div>
                  <div className="md-decoder-kv">
                    <span className="md-decoder-kv-label">Condition</span>
                    <span className="md-decoder-kv-value">{brief.instantRead.tradingCondition}</span>
                  </div>
                </div>
                <p className="md-decoder-approach">
                  <strong>Best approach:</strong> {brief.instantRead.bestApproach}
                </p>
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-wmn">
                <h3 id="md-h-wmn" className="md-decoder-card-title">
                  What matters now
                </h3>
                <ul className="md-decoder-bullets">
                  {(brief.whatMattersNow || []).map((item) => (
                    <li key={item.label}>
                      <strong>{item.label}:</strong> {item.text}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="md-decoder-card md-levels-card" aria-labelledby="md-h-levels">
                <div className="md-decoder-card-head">
                  <div>
                    <h3 id="md-h-levels" className="md-decoder-card-title">
                      Key levels
                    </h3>
                    <p className="md-decoder-small md-card-caption">Important reference points for reaction, continuation, and invalidation.</p>
                  </div>
                </div>
                <div className="md-levels-grid">
                  {brief.keyLevels?.keyLevelsDisplay ? (
                    [
                      ['resistance1', 'Resistance 1'],
                      ['resistance2', 'Resistance 2'],
                      ['support1', 'Support 1'],
                      ['support2', 'Support 2'],
                      ['previousDayHigh', 'Prior session high'],
                      ['previousDayLow', 'Prior session low'],
                      ['weeklyHigh', 'Weekly high'],
                      ['weeklyLow', 'Weekly low'],
                    ].map(([key, label]) => (
                      <div key={key} className="md-level-line">
                        <span className="md-level-label">{label}</span>
                        <span className="md-level-val">{brief.keyLevels.keyLevelsDisplay[key]}</span>
                      </div>
                    ))
                  ) : (
                    <p className="md-level-fallback">Level grid loading from server…</p>
                  )}
                </div>
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-scen">
                <div className="md-decoder-card-head">
                  <div>
                    <h3 id="md-h-scen" className="md-decoder-card-title">
                      Scenario map
                    </h3>
                    <p className="md-decoder-small md-card-caption">Read the market in branches so the next action is obvious if price confirms or fails.</p>
                  </div>
                </div>
                <div className="md-decoder-scenario">
                  <div className="md-decoder-scenario-block">
                    <div className="md-decoder-scenario-label md-decoder-scenario-label--bull">Bullish scenario</div>
                    <p className="md-decoder-small" style={{ marginTop: 0 }}>
                      <strong>Condition:</strong> {brief.scenarioMap.bullish.condition}
                    </p>
                    <p className="md-decoder-small">
                      <strong>Outcome:</strong> {brief.scenarioMap.bullish.outcome}
                    </p>
                  </div>
                  <div className="md-decoder-scenario-block">
                    <div className="md-decoder-scenario-label md-decoder-scenario-label--bear">Bearish scenario</div>
                    <p className="md-decoder-small" style={{ marginTop: 0 }}>
                      <strong>Condition:</strong> {brief.scenarioMap.bearish.condition}
                    </p>
                    <p className="md-decoder-small">
                      <strong>Outcome:</strong> {brief.scenarioMap.bearish.outcome}
                    </p>
                  </div>
                  <div className="md-decoder-scenario-block">
                    <div className="md-decoder-scenario-label md-decoder-scenario-label--flat">No-trade scenario</div>
                    <p className="md-decoder-small" style={{ marginTop: 0 }}>
                      {brief.scenarioMap.noTrade.when}
                    </p>
                  </div>
                </div>
              </section>

              <section className="md-decoder-card md-decoder-card--execution" aria-labelledby="md-h-ex">
                <div className="md-decoder-card-head">
                  <div>
                    <h3 id="md-h-ex" className="md-decoder-card-title">
                      Execution guidance
                    </h3>
                    <p className="md-decoder-small md-card-caption">Use this as the final execution filter, not as a shortcut to force a trade.</p>
                  </div>
                </div>
                {(brief.executionGuidance || brief.executionNote) && (
                  <div className="md-exec-grid">
                    <div className="md-exec-row">
                      <span className="md-exec-key">Preferred direction</span>
                      <span className="md-exec-val">
                        → {brief.executionGuidance?.preferredDirection ?? brief.executionNote?.preferredDirection}
                      </span>
                    </div>
                    <div className="md-exec-row">
                      <span className="md-exec-key">Entry condition</span>
                      <span className="md-exec-val">
                        → {brief.executionGuidance?.entryCondition ?? brief.executionNote?.confirmationNeeded}
                      </span>
                    </div>
                    <div className="md-exec-row">
                      <span className="md-exec-key">Invalidation</span>
                      <span className="md-exec-val">
                        → {brief.executionGuidance?.invalidation ?? brief.executionNote?.invalidation}
                      </span>
                    </div>
                    <div className="md-exec-row">
                      <span className="md-exec-key">Risk consideration</span>
                      <span className="md-exec-val">
                        → {brief.executionGuidance?.riskConsideration ?? '—'}
                      </span>
                    </div>
                    <div className="md-exec-row md-exec-row--avoid">
                      <span className="md-exec-key">Avoid this</span>
                      <span className="md-exec-val">
                        → {brief.executionGuidance?.avoidThis ?? brief.executionNote?.whatNotToDo}
                      </span>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="md-decoder-rail">
              <section className="md-decoder-card md-decoder-card--posture" aria-labelledby="md-h-posture">
                <h3 id="md-h-posture" className="md-decoder-card-title">
                  Final output
                </h3>
                <p className="md-decoder-posture-label">Current posture</p>
                <p className={`md-decoder-posture-value ${postureToneClass(brief.finalOutput.currentPosture)}`}>
                  {brief.finalOutput.currentPosture}
                </p>
                {brief.finalOutput.postureSubtitle && (
                  <p className="md-decoder-posture-sub">→ {brief.finalOutput.postureSubtitle}</p>
                )}
                <div className="md-decoder-posture-detail">
                  <p className="md-decoder-posture-detail-key">Reason</p>
                  <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.reason ?? '—'}</p>
                  <p className="md-decoder-posture-detail-key">What would change this</p>
                  <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.whatWouldChangeThis ?? '—'}</p>
                </div>
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-ev">
                <h3 id="md-h-ev" className="md-decoder-card-title">
                  Event risk
                </h3>
                {(brief.eventRisk || []).length === 0 ? (
                  <p className="md-decoder-small">No high-priority events parsed from calendar for this view.</p>
                ) : (
                  <ul className="md-decoder-line-list">
                    {brief.eventRisk.map((ev, i) => (
                      <li key={i}>
                        <strong>{ev.title}</strong>
                        {ev.timeUntil ? ` — ${ev.timeUntil}` : ''} · Impact: {ev.impact}
                        {ev.note ? <span className="md-ev-note"> {ev.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="md-decoder-card md-decoder-card--meets" aria-labelledby="md-h-meets">
                <h3 id="md-h-meets" className="md-decoder-card-title md-terminal-title">
                  Market meetings · {brief.header.asset}
                </h3>
                <p className="md-meets-scope md-decoder-small">
                  {brief.meta?.marketMeetingsScope === 'pair' &&
                    'Economic releases filtered to currencies linked to this instrument.'}
                  {brief.meta?.marketMeetingsScope === 'global' &&
                    'Pair-specific calendar rows were thin — showing the broader macro window for the same dates.'}
                  {brief.meta?.marketMeetingsScope === 'none' &&
                    'Economic calendar did not return rows for this window.'}
                  {!['pair', 'global', 'none'].includes(brief.meta?.marketMeetingsScope) &&
                    'Macro calendar context for upcoming releases.'}
                </p>
                {Array.isArray(brief.meta?.marketMeetings) && brief.meta.marketMeetings.length > 0 ? (
                  <ul className="md-meets-list">
                    {brief.meta.marketMeetings.map((ev, i) => (
                      <li key={`${ev.title}-${i}`}>
                        <strong>{ev.title}</strong>
                        {ev.timeUntil ? ` — ${ev.timeUntil}` : ''}
                        {ev.impact ? (
                          <span className={`md-meets-impact md-meets-impact--${String(ev.impact).toLowerCase()}`}>
                            {' '}
                            · {ev.impact}
                          </span>
                        ) : null}
                        {ev.date ? <span className="md-meets-date"> · {ev.date}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="md-decoder-small">No upcoming releases parsed for this view.</p>
                )}
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-news">
                <h3 id="md-h-news" className="md-decoder-card-title md-terminal-title">
                  Headlines · {brief.header.asset}
                </h3>
                {Array.isArray(brief.meta?.anchorNews) && brief.meta.anchorNews.length > 0 ? (
                  <ul className="md-anchor-news-list">
                    {brief.meta.anchorNews.map((item, i) => {
                      const href = String(item.url || '').trim();
                      const safe = href && href !== '#';
                      return (
                        <li key={`${href}-${i}`}>
                          {safe ? (
                            <a
                              className="md-anchor-news-link"
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.title || 'Open article'}
                            </a>
                          ) : (
                            <span className="md-anchor-news-title">{item.title || 'Headline'}</span>
                          )}
                          <div className="md-anchor-news-meta">
                            {item.source ? <span>{item.source}</span> : null}
                            {item.datetime ? (
                              <span className="md-anchor-news-time">{formatNewsTime(item.datetime)}</span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="md-decoder-small">
                    No headlines matched this symbol with the configured keys.
                  </p>
                )}
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-cross">
                <h3 id="md-h-cross" className="md-decoder-card-title">
                  Cross-asset context
                </h3>
                <ul className="md-decoder-line-list">
                  {(brief.crossAssetContext || []).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-pos">
                <h3 id="md-h-pos" className="md-decoder-card-title">
                  Positioning
                </h3>
                <div className="md-decoder-levels">
                  <div className="md-decoder-level-row">
                    <span className="md-decoder-kv-label">Retail sentiment</span>
                    <span>{brief.positioning.retailSentiment}</span>
                  </div>
                  <div className="md-decoder-level-row">
                    <span className="md-decoder-kv-label">COT</span>
                    <span>{brief.positioning.cot}</span>
                  </div>
                  <div className="md-decoder-level-row">
                    <span className="md-decoder-kv-label">Crowd bias</span>
                    <span>{brief.positioning.crowdBias}</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
