import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradeReplayChart from '../components/trader-replay/TradeReplayChart';
import CandleIntelligencePanel from '../components/operator-intelligence/CandleIntelligencePanel';
import Api from '../services/Api';
import { useAuraAnalysisData } from '../context/AuraAnalysisContext';
import { sanitizeTradeIdQueryParam } from '../lib/trader-replay/replayLink';
import { buildHeuristicTradeAnalysis } from '../lib/trader-replay/heuristicAnalysis';
import '../styles/trader-replay/TraderReplayPage.css';

const SPEEDS = [500, 900, 1400, 2000];
const TIMEFRAME_OPTIONS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '45m', value: '45' },
  { label: '1h', value: '60' },
  { label: '4h', value: '240' },
  { label: '1d', value: '1D' },
  { label: '1w', value: '1W' },
  { label: '1mo', value: '1M' },
  { label: '1y', value: '1Y' },
];

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function fmtNum(value, fixed = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(fixed) : '—';
}

function pickAnalysisPayload(res) {
  const a = res?.data?.analysis;
  if (a && typeof a === 'object') return a;
  return null;
}

export default function TraderReplay() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activePlatformId } = useAuraAnalysisData();
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [trades, setTrades] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [bars, setBars] = useState([]);
  const [chartError, setChartError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [analysisProvider, setAnalysisProvider] = useState('');
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(900);
  const [index, setIndex] = useState(0);
  const [chartInterval, setChartInterval] = useState('15');
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const [candleOpen, setCandleOpen] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [recenterTargetTime, setRecenterTargetTime] = useState(null);
  const timerRef = useRef(null);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterDir, setFilterDir] = useState('all');

  const source = useMemo(() => {
    if (activePlatformId === 'mt4' || activePlatformId === 'mt5') return activePlatformId;
    return 'all';
  }, [activePlatformId]);

  useEffect(() => {
    const run = async () => {
      setListLoading(true);
      setListError('');
      try {
        const res = await Api.getTraderReplayTrades({ source });
        const rows = Array.isArray(res?.data?.trades) ? res.data.trades : [];
        setTrades(rows);
      } catch (e) {
        setListError(e?.response?.data?.message || 'Could not load replay trades');
      } finally {
        setListLoading(false);
      }
    };
    run();
  }, [source]);

  useEffect(() => {
    const q = sanitizeTradeIdQueryParam(searchParams.get('tradeId'));
    setSelectedId(q);
  }, [searchParams]);

  const applyAnalysisResult = useCallback((trade, res, fetchError) => {
    const remote = pickAnalysisPayload(res);
    if (remote) {
      setAnalysis(remote);
      setAnalysisProvider(res?.data?.provider || 'api');
      return;
    }
    setAnalysis(buildHeuristicTradeAnalysis(trade));
    setAnalysisProvider(fetchError ? 'heuristic (analysis unavailable)' : 'heuristic');
  }, []);

  /* Trade + analysis only — candles load after trade exists (second effect). */
  useEffect(() => {
    if (!selectedId) {
      setSelectedTrade(null);
      setBars([]);
      setAnalysis(null);
      setAnalysisProvider('');
      setTradeError('');
      setChartError('');
      setPlaying(false);
      return undefined;
    }

    let cancelled = false;
    const run = async () => {
      setTradeLoading(true);
      setTradeError('');
      setChartError('');
      setPlaying(false);
      try {
        const tradeRes = await Api.getTraderReplayTrade(selectedId);
        if (cancelled) return;
        const trade = tradeRes?.data?.trade || null;
        if (!trade) {
          setSelectedTrade(null);
          setBars([]);
          setAnalysis(null);
          setTradeError(tradeRes?.data?.message || 'Trade not found');
          return;
        }
        const rid = trade.replayId || selectedId;
        setSelectedTrade(trade);

        const urlId = sanitizeTradeIdQueryParam(searchParams.get('tradeId'));
        if (rid && rid !== urlId) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set('tradeId', rid);
              return next;
            },
            { replace: true }
          );
        }

        let analysisRes = null;
        let analysisErr = null;
        try {
          analysisRes = await Api.getTraderReplayAnalysis(rid);
        } catch (e) {
          analysisErr = e;
        }
        if (cancelled) return;
        applyAnalysisResult(trade, analysisRes, analysisErr);
      } catch (e) {
        if (!cancelled) {
          setTradeError(e?.response?.data?.message || 'Could not load selected trade replay');
          setSelectedTrade(null);
          setBars([]);
          setAnalysis(null);
        }
      } finally {
        if (!cancelled) setTradeLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedId, applyAnalysisResult, setSearchParams, searchParams]);

  useEffect(() => {
    const rid = selectedTrade?.replayId;
    if (!rid) {
      setBars([]);
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const candlesRes = await Api.getTraderReplayCandles({ tradeId: rid, interval: chartInterval });
        if (cancelled) return;
        const candleBars = Array.isArray(candlesRes?.data?.bars) ? candlesRes.data.bars : [];
        setBars(candleBars);
        setChartError('');
        const openTs = selectedTrade?.openTime ? Math.floor(new Date(selectedTrade.openTime).getTime() / 1000) : null;
        const closeTs = selectedTrade?.closeTime ? Math.floor(new Date(selectedTrade.closeTime).getTime() / 1000) : null;
        const entryIdx = openTs ? Math.max(0, candleBars.findIndex((b) => Number(b.time) >= openTs)) : 0;
        const exitIdx = closeTs ? Math.max(0, candleBars.findIndex((b) => Number(b.time) >= closeTs)) : entryIdx;
        const focusIdx = Math.max(0, Math.floor((entryIdx + Math.max(entryIdx, exitIdx)) / 2));
        const focusTs = Number.isFinite(openTs) && Number.isFinite(closeTs)
          ? Math.floor((openTs + closeTs) / 2)
          : (Number.isFinite(openTs) ? openTs : closeTs);
        setIndex(Math.min(Math.max(0, candleBars.length - 1), focusIdx + 45));
        if (Number.isFinite(Number(focusTs))) {
          setRecenterTargetTime(Number(focusTs));
          setRecenterKey((k) => k + 1);
        }
      } catch (e) {
        if (!cancelled) {
          setChartError(e?.response?.data?.message || 'Chart data could not be loaded for this symbol or range.');
          setBars([]);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedTrade, chartInterval]);

  useEffect(() => {
    if (!playing || !bars.length) return undefined;
    timerRef.current = window.setInterval(() => {
      setIndex((prev) => {
        if (prev >= bars.length - 1) {
          setPlaying(false);
          return bars.length - 1;
        }
        return prev + 1;
      });
    }, speedMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playing, speedMs, bars.length]);

  const filteredTrades = useMemo(() => {
    const sym = filterSymbol.trim().toUpperCase();
    return trades.filter((t) => {
      if (sym && String(t.symbol || '').toUpperCase().indexOf(sym) === -1) return false;
      if (filterSource !== 'all' && String(t.source || '').toLowerCase() !== filterSource) return false;
      if (filterDir !== 'all' && String(t.direction || '').toLowerCase() !== filterDir) return false;
      return true;
    });
  }, [trades, filterSymbol, filterSource, filterDir]);

  const visibleBars = Math.max(1, index + 1);
  const entryTs = selectedTrade?.openTime ? Math.floor(new Date(selectedTrade.openTime).getTime() / 1000) : null;
  const exitTs = selectedTrade?.closeTime ? Math.floor(new Date(selectedTrade.closeTime).getTime() / 1000) : null;
  const entryIndex = entryTs ? Math.max(0, bars.findIndex((b) => Number(b.time) >= entryTs)) : 0;
  const exitIndex = exitTs ? Math.max(0, bars.findIndex((b) => Number(b.time) >= exitTs)) : bars.length - 1;
  const tradeMidIndex = Math.max(0, Math.floor((entryIndex + Math.max(0, exitIndex)) / 2));
  const csvMissingEntryExit = Boolean(
    selectedTrade
      && String(selectedTrade.source || '').toLowerCase() === 'csv'
      && (!Number.isFinite(Number(selectedTrade.entry)) || Number(selectedTrade.entry) <= 0
        || !Number.isFinite(Number(selectedTrade.exit)) || Number(selectedTrade.exit) <= 0)
  );

  const revealWithContext = useCallback((targetIdx) => {
    const idx = Math.max(0, Number(targetIdx) || 0);
    return Math.min(Math.max(0, bars.length - 1), idx + 45);
  }, [bars.length]);

  const centerAround = useCallback((targetTime, targetIdx) => {
    const ts = Number(targetTime);
    if (!Number.isFinite(ts)) return;
    setRecenterTargetTime(ts);
    setRecenterKey((k) => k + 1);
    setIndex(revealWithContext(targetIdx));
  }, [revealWithContext]);

  const activeReplayId = selectedTrade?.replayId || selectedId;

  const selectTrade = useCallback(
    (id) => {
      const clean = sanitizeTradeIdQueryParam(id);
      setSelectedId(clean);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (clean) next.set('tradeId', clean);
          else next.delete('tradeId');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <TraderSuiteShell
      variant="terminal"
      terminalPresentation="aura-dashboard"
      title="Trader Replay"
      description="Replay real trades from Aura Analysis sources with chart context, controls, and AI review."
      stats={
        selectedTrade
          ? [
              { label: 'Symbol', value: selectedTrade.symbol || '—' },
              { label: 'Source', value: String(selectedTrade.source || '—').toUpperCase() },
              { label: 'PnL', value: fmtNum(selectedTrade.pnl, 2) },
            ]
          : []
      }
    >
      <div className="tr-replay-page">
        {listLoading ? <div className="trader-suite-empty">Loading replayable trades…</div> : null}
        {listError ? <div className="tr-replay-empty tr-replay-empty--error">{listError}</div> : null}
        {tradeError ? <div className="tr-replay-empty tr-replay-empty--error">{tradeError}</div> : null}

        {selectedTrade ? (
          <header className="tr-replay-banner">
            <h2>
              {selectedTrade.symbol || '—'} · {(selectedTrade.direction || '').toUpperCase()} ·{' '}
              {String(selectedTrade.source || '').toUpperCase()}
            </h2>
            <div className="tr-replay-banner-meta">
              <span>
                Open <strong>{fmtDate(selectedTrade.openTime)}</strong>
              </span>
              <span>
                Close <strong>{fmtDate(selectedTrade.closeTime)}</strong>
              </span>
              <span>
                P/L <strong>{fmtNum(selectedTrade.pnl, 2)}</strong>
              </span>
              <span>
                Replay ID <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{activeReplayId}</strong>
              </span>
            </div>
          </header>
        ) : null}

        <div className="tr-replay-grid">
          <aside className="tr-replay-aside trader-suite-panel">
            <h3>Trades</h3>
            <div className="tr-replay-filters">
              <input
                type="search"
                placeholder="Filter symbol…"
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
                aria-label="Filter by symbol"
              />
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} aria-label="Filter by source">
                <option value="all">All sources</option>
                <option value="mt4">MT4</option>
                <option value="mt5">MT5</option>
                <option value="csv">CSV</option>
                <option value="aura">Aura</option>
              </select>
              <select value={filterDir} onChange={(e) => setFilterDir(e.target.value)} aria-label="Filter by direction">
                <option value="all">Buy + Sell</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            {filteredTrades.length === 0 ? (
              <p className="tr-replay-empty" style={{ padding: '12px 0' }}>
                {trades.length === 0 ? 'Select a trade to replay.' : 'No trades match filters.'}
              </p>
            ) : (
              <div className="tr-replay-trade-list">
                {filteredTrades.map((t) => {
                  const tid = t.id;
                  const isActive = tid && activeReplayId && tid === activeReplayId;
                  return (
                    <div key={tid} className={`tr-replay-trade-card ${isActive ? 'tr-replay-trade-card--active' : ''}`}>
                      <div className="tr-replay-trade-card-top">
                        <strong>{t.symbol || '—'}</strong>
                        <span className="tr-replay-pill">{String(t.source || '').toUpperCase()}</span>
                      </div>
                      <div className="tr-replay-trade-card-sub">{fmtDate(t.openTime)}</div>
                      <button
                        type="button"
                        className="trader-suite-btn trader-suite-btn--primary"
                        style={{ width: '100%' }}
                        onClick={() => selectTrade(tid)}
                      >
                        Replay
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          <main className="tr-replay-main trader-suite-panel">
            {tradeLoading ? <div className="tr-replay-empty">Loading trade…</div> : null}
            {!tradeLoading && !selectedTrade && !tradeError ? (
              <div className="tr-replay-empty">Select a trade to replay.</div>
            ) : null}

            {selectedTrade ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {[
                    ['Symbol', selectedTrade.symbol],
                    ['Direction', selectedTrade.direction],
                    ['Open', fmtDate(selectedTrade.openTime)],
                    ['Close', fmtDate(selectedTrade.closeTime)],
                    ['Entry', fmtNum(selectedTrade.entry, 5)],
                    ['Exit', fmtNum(selectedTrade.exit, 5)],
                    ['SL', fmtNum(selectedTrade.stopLoss, 5)],
                    ['TP', fmtNum(selectedTrade.takeProfit, 5)],
                    ['Lot Size', fmtNum(selectedTrade.lotSize, 2)],
                    ['PnL', fmtNum(selectedTrade.pnl, 2)],
                    ['Duration (s)', selectedTrade.durationSeconds ?? '—'],
                    ['Source', String(selectedTrade.source || '').toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="trader-suite-card" style={{ padding: 8 }}>
                      <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div className="tr-replay-controls">
                  <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => setPlaying(true)}>
                    Play
                  </button>
                  <button type="button" className="trader-suite-btn" onClick={() => setPlaying(false)}>
                    Pause
                  </button>
                  <button type="button" className="trader-suite-btn" onClick={() => setIndex((i) => Math.min(i + 1, Math.max(0, bars.length - 1)))}>
                    Step +
                  </button>
                  <button type="button" className="trader-suite-btn" onClick={() => setIndex((i) => Math.max(i - 1, 0))}>
                    Step −
                  </button>
                  <button
                    type="button"
                    className="trader-suite-btn"
                    onClick={() => centerAround(entryTs, entryIndex)}
                  >
                    Jump entry
                  </button>
                  <button
                    type="button"
                    className="trader-suite-btn"
                    onClick={() => centerAround(exitTs || entryTs, exitIndex)}
                  >
                    Jump exit
                  </button>
                  <button
                    type="button"
                    className="trader-suite-btn"
                    onClick={() => centerAround(
                      Number.isFinite(entryTs) && Number.isFinite(exitTs) ? Math.floor((entryTs + exitTs) / 2) : (entryTs || exitTs),
                      tradeMidIndex
                    )}
                  >
                    Reset View
                  </button>
                  <label>
                    <span>Speed</span>
                    <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
                      {SPEEDS.map((v) => (
                        <option key={v} value={v}>
                          {v} ms
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Timeframe</span>
                    <select value={chartInterval} onChange={(e) => setChartInterval(e.target.value)}>
                      {TIMEFRAME_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {csvMissingEntryExit ? (
                  <div className="trader-suite-card" style={{ marginBottom: 8, padding: 8, fontSize: 12, color: '#f8c37d' }}>
                    This CSV trade is missing entry/exit prices, so replay markers may be limited.
                  </div>
                ) : null}

                {hoverTooltip ? (
                  <div className="trader-suite-card" style={{ marginBottom: 8, padding: 8, fontSize: 12 }}>
                    {hoverTooltip.timeIso} | O:{hoverTooltip.open} H:{hoverTooltip.high} L:{hoverTooltip.low} C:{hoverTooltip.close}
                    {' '}
                    | Δ{hoverTooltip.movePct != null ? `${hoverTooltip.movePct.toFixed(3)}%` : 'n/a'} | R:{hoverTooltip.range.toFixed(5)}
                  </div>
                ) : null}

                <div className="tr-replay-chart-wrap">
                  {chartError ? <div className="tr-replay-chart-error">{chartError}</div> : null}
                  <TradeReplayChart
                    bars={bars}
                    visibleBars={visibleBars}
                    trade={selectedTrade}
                    currentIndex={index}
                    recenterKey={recenterKey}
                    recenterTargetTime={recenterTargetTime}
                    symbol={selectedTrade.symbol}
                    interval={chartInterval}
                    onHoverCandle={setHoverTooltip}
                    onSelectCandle={(bar) => {
                      setSelectedBar(bar);
                      setCandleOpen(true);
                    }}
                  />
                </div>

                <section className="tr-replay-ai">
                  <h3>AI trade review</h3>
                  {!analysis ? (
                    <p className="tr-replay-empty" style={{ padding: '8px 0' }}>
                      Preparing analysis…
                    </p>
                  ) : (
                    <>
                      <div className="tr-replay-ai-grid">
                        <div className="tr-replay-ai-block">
                          <h4>Good</h4>
                          <ul>
                            {(analysis.strengths || []).map((x, i) => (
                              <li key={`g-${i}`}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="tr-replay-ai-block">
                          <h4>Bad</h4>
                          <ul>
                            {(analysis.weaknesses || []).map((x, i) => (
                              <li key={`b-${i}`}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="tr-replay-ai-block">
                          <h4>Improve</h4>
                          <ul>
                            {(analysis.betterApproach || []).map((x, i) => (
                              <li key={`i-${i}`}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="tr-replay-ai-block">
                          <h4>Next time</h4>
                          <ul>
                            {(analysis.nextTimeChecklist || []).map((x, i) => (
                              <li key={`n-${i}`}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {analysis.verdict ? (
                        <div className="tr-replay-ai-verdict">
                          <strong>Entry / exit / risk / timing:</strong>{' '}
                          {[analysis.verdict.entry, analysis.verdict.exit, analysis.verdict.risk, analysis.verdict.timing]
                            .filter(Boolean)
                            .join(' ')}
                        </div>
                      ) : null}
                      <div className="tr-replay-ai-provider">Source: {analysisProvider || '—'}</div>
                    </>
                  )}
                </section>
              </>
            ) : null}
          </main>
        </div>
      </div>

      <CandleIntelligencePanel
        open={candleOpen}
        onClose={() => setCandleOpen(false)}
        bar={selectedBar}
        symbol={selectedTrade?.symbol || ''}
        interval={chartInterval}
      />
    </TraderSuiteShell>
  );
}
