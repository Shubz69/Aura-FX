import React, { useState, useCallback } from 'react';
import Api from '../../services/Api';
import '../../styles/trader-deck/MarketDecoder.css';

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatLevel(v, marketType) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (marketType === 'FX' || marketType === 'Commodity') return n.toFixed(5);
  if (marketType === 'Crypto' && n > 200) return n.toFixed(2);
  return n.toFixed(n < 50 ? 4 : 2);
}

function biasPillClass(bias) {
  const b = (bias || '').toLowerCase();
  if (b === 'bullish') return 'md-decoder-pill md-decoder-pill--bull';
  if (b === 'bearish') return 'md-decoder-pill md-decoder-pill--bear';
  return 'md-decoder-pill md-decoder-pill--neutral';
}

export default function MarketDecoderView({ embedded }) {
  const [q, setQ] = useState('EURUSD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);

  const run = useCallback(
    async (symbol, refresh = false) => {
      const sym = String(symbol || '').trim();
      if (!sym) return;
      setLoading(true);
      setError(null);
      try {
        const res = await Api.getTraderDeckMarketDecoder(sym, { refresh });
        const data = res.data;
        if (!data.success) {
          setError(data.message || 'Could not decode this symbol.');
          setBrief(null);
          return;
        }
        setBrief(data.brief);
        setCached(Boolean(data.cached));
      } catch (e) {
        setError(e?.response?.data?.message || e.message || 'Request failed');
        setBrief(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onSubmit = (e) => {
    e.preventDefault();
    run(q, true);
  };

  const mt = brief?.header?.marketType || 'FX';

  return (
    <div className={`md-decoder ${embedded ? 'md-decoder--embedded' : ''}`}>
      <header className="md-decoder-hero">
        <p className="md-decoder-hero-eyebrow">Aura Terminal</p>
        <h2 className="md-decoder-hero-title">Market Decoder</h2>
        <p className="md-decoder-hero-sub">
          Rules-first decision brief per asset — structured like an institutional desk handoff. Enter a symbol to generate bias,
          levels, scenarios, and execution context.
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
        {cached && brief && (
          <p className="md-decoder-meta">Served from cache — Decode again for a fresh pull.</p>
        )}
      </header>

      {error && (
        <div className="md-decoder-error" role="alert">
          {error}
        </div>
      )}

      {brief && (
        <div className="md-decoder-stack">
          <div className="md-decoder-top-grid">
            {/* 1 Header */}
            <section className="md-decoder-card" aria-labelledby="md-h-header">
              <h3 id="md-h-header" className="md-decoder-card-title">
                Header
              </h3>
              <div className="md-decoder-header-grid">
                <div className="md-decoder-kv">
                  <span className="md-decoder-kv-label">Asset</span>
                  <span className="md-decoder-kv-value md-decoder-kv-value--lg">{brief.header.asset}</span>
                </div>
                <div className="md-decoder-kv">
                  <span className="md-decoder-kv-label">Price</span>
                  <span className="md-decoder-kv-value">{formatLevel(brief.header.price, mt)}</span>
                </div>
                <div className="md-decoder-kv">
                  <span className="md-decoder-kv-label">Daily %</span>
                  <span className="md-decoder-kv-value">{formatPct(brief.header.changePercent)}</span>
                </div>
                <div className="md-decoder-kv">
                  <span className="md-decoder-kv-label">Market type</span>
                  <span className="md-decoder-kv-value">{brief.header.marketType}</span>
                </div>
              </div>
            </section>

            {/* Market Pulse — desk-style state module */}
            {brief.marketPulse && (
              <section className="md-decoder-card md-decoder-card--pulse" aria-labelledby="md-h-pulse">
                <h3 id="md-h-pulse" className="md-decoder-card-title">
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

          {/* 2 Instant Read */}
          <section className="md-decoder-card md-decoder-card--instant" aria-labelledby="md-h-instant">
            <h3 id="md-h-instant" className="md-decoder-card-title">
              Instant read
            </h3>
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
              <strong style={{ color: 'rgba(212,175,55,0.95)' }}>Best approach:</strong> {brief.instantRead.bestApproach}
            </p>
          </section>

          {/* 3 What matters now */}
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

          {/* 4 Key levels */}
          <section className="md-decoder-card" aria-labelledby="md-h-levels">
            <h3 id="md-h-levels" className="md-decoder-card-title">
              Key levels
            </h3>
            <div className="md-decoder-levels">
              <div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Resistance 1</span>
                  <span>{formatLevel(brief.keyLevels.resistance1, mt)}</span>
                </div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Resistance 2</span>
                  <span>{formatLevel(brief.keyLevels.resistance2, mt)}</span>
                </div>
              </div>
              <div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Support 1</span>
                  <span>{formatLevel(brief.keyLevels.support1, mt)}</span>
                </div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Support 2</span>
                  <span>{formatLevel(brief.keyLevels.support2, mt)}</span>
                </div>
              </div>
              <div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Prior day high</span>
                  <span>{formatLevel(brief.keyLevels.previousDayHigh, mt)}</span>
                </div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Prior day low</span>
                  <span>{formatLevel(brief.keyLevels.previousDayLow, mt)}</span>
                </div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Weekly high</span>
                  <span>{formatLevel(brief.keyLevels.weeklyHigh, mt)}</span>
                </div>
                <div className="md-decoder-level-row">
                  <span className="md-decoder-kv-label">Weekly low</span>
                  <span>{formatLevel(brief.keyLevels.weeklyLow, mt)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* 5 Scenario map */}
          <section className="md-decoder-card" aria-labelledby="md-h-scen">
            <h3 id="md-h-scen" className="md-decoder-card-title">
              Scenario map
            </h3>
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

          {/* 6 Cross-asset */}
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

          {/* 7 Positioning */}
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

          {/* 8 Event risk */}
          <section className="md-decoder-card" aria-labelledby="md-h-ev">
            <h3 id="md-h-ev" className="md-decoder-card-title">
              Event risk
            </h3>
            {(brief.eventRisk || []).length === 0 ? (
              <p className="md-decoder-small">No high-priority events parsed from calendar (check data keys).</p>
            ) : (
              <ul className="md-decoder-line-list">
                {brief.eventRisk.map((ev, i) => (
                  <li key={i}>
                    <strong>{ev.title}</strong>
                    {ev.timeUntil ? ` — ${ev.timeUntil}` : ''} · Impact: {ev.impact}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 9 Execution guidance */}
          <section className="md-decoder-card md-decoder-card--execution" aria-labelledby="md-h-ex">
            <h3 id="md-h-ex" className="md-decoder-card-title">
              Execution guidance
            </h3>
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
                    →{' '}
                    {brief.executionGuidance?.entryCondition ?? brief.executionNote?.confirmationNeeded}
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

          {/* 10 Final posture */}
          <section className="md-decoder-card md-decoder-card--posture" aria-labelledby="md-h-posture">
            <h3 id="md-h-posture" className="md-decoder-card-title">
              Final output
            </h3>
            <p className="md-decoder-posture-label">Current posture</p>
            <p className="md-decoder-posture-value">{brief.finalOutput.currentPosture}</p>
            {brief.finalOutput.postureSubtitle && (
              <p className="md-decoder-posture-sub">→ {brief.finalOutput.postureSubtitle}</p>
            )}
            <div className="md-decoder-posture-detail">
              <p className="md-decoder-posture-detail-key">Reason</p>
              <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.reason ?? '—'}</p>
              <p className="md-decoder-posture-detail-key">What would change this</p>
              <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.whatWouldChangeThis ?? '—'}</p>
            </div>
            {brief.meta && (
              <p className="md-decoder-small" style={{ textAlign: 'center', marginTop: 14 }}>
                Rules engine: bull {brief.meta.bullScore} · bear {brief.meta.bearScore} · net {brief.meta.netScore}
                {brief.meta.finnhubSymbol ? ` · ${brief.meta.finnhubSymbol}` : ''}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
