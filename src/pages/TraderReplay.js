import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TraderSuiteShell from '../components/TraderSuiteShell';
import TradeReplayChart from '../components/trader-replay/TradeReplayChart';
import CandleIntelligencePanel from '../components/operator-intelligence/CandleIntelligencePanel';
import Api from '../services/Api';
import { useAuraAnalysisData } from '../context/AuraAnalysisContext';

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

export default function TraderReplay() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activePlatformId } = useAuraAnalysisData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trades, setTrades] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [bars, setBars] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(900);
  const [index, setIndex] = useState(0);
  const [chartInterval, setChartInterval] = useState('15');
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const [candleOpen, setCandleOpen] = useState(false);
  const timerRef = useRef(null);

  const source = useMemo(() => {
    if (activePlatformId === 'mt4' || activePlatformId === 'mt5') return activePlatformId;
    return 'all';
  }, [activePlatformId]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await Api.getTraderReplayTrades({ source });
        const rows = Array.isArray(res?.data?.trades) ? res.data.trades : [];
        setTrades(rows);
      } catch (e) {
        setError(e?.response?.data?.message || 'Could not load replay trades');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [source]);

  useEffect(() => {
    const q = searchParams.get('tradeId');
    if (!q) return;
    setSelectedId(q);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) return;
    const run = async () => {
      setError('');
      setPlaying(false);
      try {
        const [tradeRes, candlesRes, analysisRes] = await Promise.all([
          Api.getTraderReplayTrade(selectedId),
          Api.getTraderReplayCandles({ tradeId: selectedId, interval: chartInterval }),
          Api.getTraderReplayAnalysis(selectedId),
        ]);
        const trade = tradeRes?.data?.trade || null;
        const candleBars = Array.isArray(candlesRes?.data?.bars) ? candlesRes.data.bars : [];
        setSelectedTrade(trade);
        setBars(candleBars);
        setAnalysis(analysisRes?.data?.analysis || null);
        const entryTs = trade?.openTime ? Math.floor(new Date(trade.openTime).getTime() / 1000) : null;
        const entryIndex = entryTs ? Math.max(0, candleBars.findIndex((b) => Number(b.time) >= entryTs)) : 0;
        setIndex(entryIndex >= 0 ? entryIndex : 0);
      } catch (e) {
        setError(e?.response?.data?.message || 'Could not load selected trade replay');
        setSelectedTrade(null);
        setBars([]);
      }
    };
    run();
  }, [selectedId, chartInterval]);

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

  const visibleBars = Math.max(1, index + 1);
  const entryTs = selectedTrade?.openTime ? Math.floor(new Date(selectedTrade.openTime).getTime() / 1000) : null;
  const exitTs = selectedTrade?.closeTime ? Math.floor(new Date(selectedTrade.closeTime).getTime() / 1000) : null;
  const entryIndex = entryTs ? Math.max(0, bars.findIndex((b) => Number(b.time) >= entryTs)) : 0;
  const exitIndex = exitTs ? Math.max(0, bars.findIndex((b) => Number(b.time) >= exitTs)) : bars.length - 1;

  return (
    <TraderSuiteShell
      variant="terminal"
      terminalPresentation="aura-dashboard"
      title="Trader Replay"
      description="Replay real trades from Aura Analysis sources with chart context, controls, and AI review."
      stats={selectedTrade ? [
        { label: 'Symbol', value: selectedTrade.symbol || '—' },
        { label: 'Source', value: String(selectedTrade.source || '—').toUpperCase() },
        { label: 'PnL', value: fmtNum(selectedTrade.pnl, 2) },
      ] : []}
    >
      {loading ? <div className="trader-suite-empty">Loading replayable trades...</div> : null}
      {error ? <div className="trader-suite-empty">{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 330px) 1fr', gap: 12 }}>
        <aside className="trader-suite-panel">
          <h3 style={{ marginTop: 0 }}>Trades</h3>
          {trades.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.65)' }}>Select a trade to replay.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 700, overflow: 'auto' }}>
              {trades.map((t) => (
                <div key={t.id} className="trader-suite-card" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{t.symbol || '—'}</strong>
                    <span>{String(t.source || '').toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{fmtDate(t.openTime)}</div>
                  <button
                    type="button"
                    className="trader-suite-btn trader-suite-btn--primary"
                    onClick={() => {
                      setSelectedId(t.id);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('tradeId', t.id);
                        return next;
                      }, { replace: true });
                    }}
                  >
                    Replay
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="trader-suite-panel">
          {!selectedTrade ? <div className="trader-suite-empty">Select a trade to replay.</div> : null}
          {selectedTrade ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
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
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{k}</div>
                    <div style={{ fontSize: 13 }}>{v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={() => setPlaying(true)}>Play</button>
                <button type="button" className="trader-suite-btn" onClick={() => setPlaying(false)}>Pause</button>
                <button type="button" className="trader-suite-btn" onClick={() => setIndex((i) => Math.min(i + 1, bars.length - 1))}>Step +</button>
                <button type="button" className="trader-suite-btn" onClick={() => setIndex((i) => Math.max(i - 1, 0))}>Step -</button>
                <button type="button" className="trader-suite-btn" onClick={() => setIndex(Math.max(0, entryIndex))}>Jump Entry</button>
                <button type="button" className="trader-suite-btn" onClick={() => setIndex(Math.max(0, exitIndex))}>Jump Exit</button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>Speed</span>
                  <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
                    {SPEEDS.map((v) => <option key={v} value={v}>{v} ms</option>)}
                  </select>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>Timeframe</span>
                  <select value={chartInterval} onChange={(e) => setChartInterval(e.target.value)}>
                    {TIMEFRAME_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </label>
              </div>

              {hoverTooltip ? (
                <div className="trader-suite-card" style={{ marginBottom: 8, padding: 8, fontSize: 12 }}>
                  {hoverTooltip.timeIso} | O:{hoverTooltip.open} H:{hoverTooltip.high} L:{hoverTooltip.low} C:{hoverTooltip.close}
                  {' '}| Δ{hoverTooltip.movePct != null ? `${hoverTooltip.movePct.toFixed(3)}%` : 'n/a'} | R:{hoverTooltip.range.toFixed(5)}
                </div>
              ) : null}
              <TradeReplayChart
                bars={bars}
                visibleBars={visibleBars}
                trade={selectedTrade}
                currentIndex={index}
                symbol={selectedTrade.symbol}
                interval={chartInterval}
                onHoverCandle={setHoverTooltip}
                onSelectCandle={(bar) => {
                  setSelectedBar(bar);
                  setCandleOpen(true);
                }}
              />

              <section className="trader-suite-card" style={{ marginTop: 12, padding: 12 }}>
                <h3 style={{ marginTop: 0 }}>AI Trade Review</h3>
                {!analysis ? <p>Loading analysis...</p> : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <p><strong>What was good:</strong> {(analysis.strengths || []).join(' ') || '—'}</p>
                    <p><strong>What was bad:</strong> {(analysis.weaknesses || []).join(' ') || '—'}</p>
                    <p><strong>What to do differently:</strong> {(analysis.betterApproach || []).join(' ') || '—'}</p>
                    <p><strong>What to watch next time:</strong> {(analysis.nextTimeChecklist || []).join(' ') || '—'}</p>
                    <p><strong>Entry / Exit / Risk / Timing:</strong> {analysis.verdict ? `${analysis.verdict.entry} ${analysis.verdict.exit} ${analysis.verdict.risk} ${analysis.verdict.timing}` : '—'}</p>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>
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
