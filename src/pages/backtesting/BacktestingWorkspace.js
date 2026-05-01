import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import TradeReplayChart from '../../components/trader-replay/TradeReplayChart';
import CandleIntelligencePanel from '../../components/operator-intelligence/CandleIntelligencePanel';
import { replayPortfolioFloatingUsd, replayTradePnlUsd } from '../../lib/backtesting/replayPnl';
import '../../styles/backtesting/Backtesting.css';

const SPEEDS = [250, 500, 900, 1400, 2200];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'M45', 'H1', 'H4', 'D1', 'W1', 'MN1', 'Y1'];

function fmt(v, d = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

function replayTimeframeToInterval(tf) {
  const raw = String(tf || '').toUpperCase();
  if (raw === 'M1') return '1';
  if (raw === 'M5') return '5';
  if (raw === 'M15') return '15';
  if (raw === 'M30') return '30';
  if (raw === 'M45') return '45';
  if (raw === 'H1') return '60';
  if (raw === 'H4') return '240';
  if (raw === 'D1') return '1D';
  if (raw === 'W1') return '1W';
  if (raw === 'MN1') return '1M';
  if (raw === 'Y1') return '1Y';
  return '15';
}

/** @returns {{ price: number } | null} */
function detectReplaySlTp(bar, trade) {
  const h = Number(bar.high);
  const l = Number(bar.low);
  if (!Number.isFinite(h) || !Number.isFinite(l)) return null;
  const sl = trade.stopLoss != null && trade.stopLoss !== '' ? Number(trade.stopLoss) : NaN;
  const tp = trade.takeProfit != null && trade.takeProfit !== '' ? Number(trade.takeProfit) : NaN;
  const dir = String(trade.direction || 'long').toLowerCase();
  const isShort = dir === 'short' || dir === 'sell';
  if (!isShort) {
    if (Number.isFinite(sl) && l <= sl) return { price: sl };
    if (Number.isFinite(tp) && h >= tp) return { price: tp };
  } else {
    if (Number.isFinite(sl) && h >= sl) return { price: sl };
    if (Number.isFinite(tp) && l <= tp) return { price: tp };
  }
  return null;
}

function pnlHintsForInstrument(chartInstrument, markPrice, tradeInstrument) {
  const px = Number(markPrice);
  const chart = String(chartInstrument || '').toUpperCase();
  const tins = String(tradeInstrument || '').toUpperCase();
  const hints = {};
  if (tins === 'USDJPY' && Number.isFinite(px)) hints.usdJpyHint = px;
  if (tins.endsWith('JPY') && tins !== 'USDJPY')
    hints.crossUsdJpy = chart === 'USDJPY' && Number.isFinite(px) ? px : 150;
  return hints;
}

export default function BacktestingWorkspace() {
  const { sessionId } = useParams();
  const timerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [allTrades, setAllTrades] = useState([]);
  const [savedTrades, setSavedTrades] = useState([]);
  const [candles, setCandles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const [candleOpen, setCandleOpen] = useState(false);
  const [chartFitKey, setChartFitKey] = useState(0);
  const [persistBusy, setPersistBusy] = useState(false);

  const [controls, setControls] = useState({
    instrument: 'EURUSD',
    timeframe: 'M15',
    date: '',
    time: '09:00',
    speedMs: 900,
  });
  const [ticket, setTicket] = useState({
    lotSize: 0.1,
    stopLoss: '',
    takeProfit: '',
    notes: '',
  });

  const visibleBars = useMemo(() => Math.max(1, cursor + 1), [cursor]);
  const visibleSlice = useMemo(() => candles.slice(0, visibleBars), [candles, visibleBars]);
  const currentBar = visibleSlice[visibleSlice.length - 1] || null;
  const openTrades = useMemo(() => allTrades.filter((t) => !t.closeTime), [allTrades]);
  const closedTrades = useMemo(() => allTrades.filter((t) => !!t.closeTime), [allTrades]);

  const markToMarketPnl = useMemo(() => {
    const px = Number(currentBar?.close);
    if (!Number.isFinite(px)) return 0;
    const chartIns = String(controls.instrument || '').toUpperCase();
    return replayPortfolioFloatingUsd(openTrades, px, {
      usdJpy: chartIns === 'USDJPY' ? px : undefined,
      crossUsdJpy: chartIns === 'USDJPY' ? px : undefined,
    });
  }, [currentBar?.close, openTrades, controls.instrument]);

  const closedPnl = useMemo(
    () => closedTrades.reduce((acc, t) => acc + Number(t.pnlAmount || 0), 0),
    [closedTrades]
  );
  const balance = useMemo(
    () => Number(session?.initialBalance || 0) + closedPnl,
    [closedPnl, session?.initialBalance]
  );
  const equity = useMemo(() => balance + markToMarketPnl, [balance, markToMarketPnl]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!playing || candles.length === 0) return undefined;
    timerRef.current = window.setInterval(() => {
      setCursor((prev) => {
        if (prev >= candles.length - 1) {
          setPlaying(false);
          return candles.length - 1;
        }
        return prev + 1;
      });
    }, Number(controls.speedMs) || 900);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [candles.length, controls.speedMs, playing]);

  const refreshSessionData = async () => {
    const [sOut, tOut, svOut] = await Promise.allSettled([
      Api.getBacktestingSession(sessionId),
      Api.getBacktestingSessionTrades(sessionId),
      Api.listBacktestingSavedTrades(),
    ]);
    if (sOut.status === 'rejected') throw sOut.reason;
    const sRes = sOut.value;
    if (!sRes.data?.success) {
      const msg = sRes.data?.message || 'Session not found';
      const err = new Error(msg);
      err.response = sRes;
      throw err;
    }
    setSession(sRes.data.session);
    if (tOut.status === 'fulfilled' && tOut.value.data?.success) {
      setAllTrades(tOut.value.data.trades || []);
    }
    if (svOut.status === 'fulfilled' && svOut.value.data?.success) {
      setSavedTrades(svOut.value.data.trades || []);
    }
    const s = sRes.data.session;
    if (s) {
      const instrument = s.lastActiveInstrument || s.instruments?.[0] || 'EURUSD';
      const dt = s.lastReplayAt ? new Date(s.lastReplayAt) : new Date();
      setControls((prev) => ({
        ...prev,
        instrument,
        timeframe: s.replayTimeframe || prev.timeframe,
        date: dt.toISOString().slice(0, 10),
        time: dt.toISOString().slice(11, 16),
      }));
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        await refreshSessionData();
      } catch (e) {
        const msg = e?.response?.data?.message || 'Could not load backtesting workspace';
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const loadCandles = async () => {
    if (!controls.instrument || !controls.date || !controls.time) {
      toast.error('Select instrument, date, and time first.');
      return;
    }
    setBusy(true);
    setPlaying(false);
    setLoadError('');
    try {
      const fromIso = `${controls.date}T${controls.time}:00.000Z`;
      const fromSec = Math.floor(new Date(fromIso).getTime() / 1000);
      const toSec = fromSec + 86400 * 14;
      const res = await Api.getBacktestingCandles({
        symbol: controls.instrument,
        timeframe: controls.timeframe,
        from: fromSec,
        to: toSec,
      });
      const list = Array.isArray(res.data?.bars) ? res.data.bars : [];
      if (!list.length) {
        toast.error('No historical candles returned for that request.');
        setCandles([]);
        return;
      }
      const start = Math.max(0, list.findIndex((b) => Number(b.time) >= fromSec));
      setCandles(list);
      setStartIndex(start);
      setCursor(start);
      setChartFitKey((k) => k + 1);
      await Api.patchBacktestingSession(sessionId, {
        lastActiveInstrument: controls.instrument,
        replayTimeframe: controls.timeframe,
        lastReplayAt: new Date(fromSec * 1000).toISOString(),
      });
      await Api.patchBacktestingReplaySession(sessionId, {
        lastReplayAt: new Date(fromSec * 1000).toISOString(),
        replayState: {
          symbol: controls.instrument,
          timeframe: controls.timeframe,
          fromSec,
          cursor: start,
        },
      });
    } catch (e) {
      const msg = e?.response?.data?.message || 'Failed to load candles';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const placeTrade = async (direction) => {
    const entry = Number(currentBar?.close);
    const lots = Number(ticket.lotSize);
    if (!Number.isFinite(lots) || lots <= 0) {
      toast.error('Lot size must be greater than zero.');
      return;
    }
    if (!Number.isFinite(entry)) {
      toast.error('Load candles first.');
      return;
    }
    try {
      const res = await Api.placeBacktestingReplayTrade(sessionId, {
        instrument: controls.instrument,
        timeframe: controls.timeframe,
        direction,
        entryPrice: entry,
        stopLoss: ticket.stopLoss !== '' ? Number(ticket.stopLoss) : null,
        takeProfit: ticket.takeProfit !== '' ? Number(ticket.takeProfit) : null,
        lotSize: lots,
        openTime: new Date(Number(currentBar.time) * 1000).toISOString(),
        replayReference: { cursor, startIndex, symbol: controls.instrument, timeframe: controls.timeframe },
      });
      if (res.data?.success) {
        toast.success(`${direction.toUpperCase()} trade placed`);
        const trRes = await Api.getBacktestingSessionTrades(sessionId);
        if (trRes.data?.success) setAllTrades(trRes.data.trades || []);
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not place simulated trade');
    }
  };

  useEffect(() => {
    if (!candles.length || !currentBar || !openTrades.length || !sessionId) return undefined;
    const bar = currentBar;

    let cancelled = false;
    (async () => {
      const toCheck = [...openTrades];
      for (const t of toCheck) {
        const hit = detectReplaySlTp(bar, t);
        if (!hit || cancelled) continue;
        const hints = pnlHintsForInstrument(controls.instrument, hit.price, t.instrument);
        const pnlAmount = replayTradePnlUsd(
          t.direction,
          Number(t.entryPrice),
          hit.price,
          t.instrument,
          Number(t.positionSize || 0),
          hints
        );
        try {
          await Api.closeBacktestingReplayTrade(sessionId, t.id, {
            exitPrice: hit.price,
            closeTime: new Date(Number(bar.time) * 1000).toISOString(),
            pnlAmount: Number.isFinite(pnlAmount) ? pnlAmount : undefined,
          });
          const trRes = await Api.getBacktestingSessionTrades(sessionId);
          if (trRes.data?.success) setAllTrades(trRes.data.trades || []);
        } catch (e) {
          /* one auto-close per bar */
        }
        break;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cursor, candles, currentBar, openTrades, sessionId, controls.instrument]);

  const closeTrade = async (tradeId) => {
    const px = Number(currentBar?.close);
    if (!Number.isFinite(px)) return;
    const t = openTrades.find((x) => x.id === tradeId);
    const hints = t ? pnlHintsForInstrument(controls.instrument, px, t.instrument) : {};
    const pnlAmount = t
      ? replayTradePnlUsd(t.direction, Number(t.entryPrice), px, t.instrument, Number(t.positionSize || 0), hints)
      : null;
    try {
      await Api.closeBacktestingReplayTrade(sessionId, tradeId, {
        exitPrice: px,
        closeTime: new Date(Number(currentBar.time) * 1000).toISOString(),
        pnlAmount: Number.isFinite(pnlAmount) ? pnlAmount : undefined,
      });
      const trRes = await Api.getBacktestingSessionTrades(sessionId);
      if (trRes.data?.success) setAllTrades(trRes.data.trades || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not close trade');
    }
  };

  const saveTrade = async (trade) => {
    try {
      const aiRes = await Api.getBacktestingAiCoach({
        instrument: controls.instrument,
        timeframe: controls.timeframe,
        currentPrice: currentBar?.close,
        direction: trade.direction,
        accountBalance: session?.initialBalance,
        openTrades,
      });
      const feedback = aiRes.data?.feedback?.answer || '';
      await Api.saveBacktestingTrade({
        sourceTradeId: trade.id,
        replayReference: {
          symbol: controls.instrument,
          timeframe: controls.timeframe,
          entryTime: trade.openTime,
          exitTime: trade.closeTime,
          cursor,
        },
        notes: ticket.notes,
        aiFeedback: feedback,
      });
      const svRes = await Api.listBacktestingSavedTrades();
      if (svRes.data?.success) setSavedTrades(svRes.data.trades || []);
      toast.success('Trade saved for review');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save completed trade');
    }
  };

  const askCoach = async () => {
    if (!chatQuestion.trim()) return;
    const question = chatQuestion.trim();
    setChatQuestion('');
    setChatHistory((p) => [...p, { role: 'user', text: question }]);
    setChatBusy(true);
    try {
      const res = await Api.getBacktestingAiCoach({
        question,
        instrument: controls.instrument,
        timeframe: controls.timeframe,
        currentPrice: currentBar?.close,
        visibleCandles: visibleSlice.slice(-30),
        openTrades,
        savedTrades: savedTrades.slice(0, 10),
        accountBalance: session?.initialBalance,
      });
      const ans = res.data?.feedback?.answer || 'No coaching feedback returned.';
      setChatHistory((p) => [...p, { role: 'assistant', text: ans }]);
    } catch (e) {
      setChatHistory((p) => [...p, { role: 'assistant', text: e?.response?.data?.message || 'Coaching request failed.' }]);
    } finally {
      setChatBusy(false);
    }
  };

  const persistSessionToLibrary = async () => {
    setPersistBusy(true);
    try {
      await Api.patchBacktestingSession(sessionId, { persistSession: true });
      await refreshSessionData();
      toast.success('Session saved — it stays in your library and will no longer expire after 24 hours.');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save session');
    } finally {
      setPersistBusy(false);
    }
  };

  const loadSavedTradeReplay = (saved) => {
    const ref = saved?.replayReference || {};
    if (ref?.symbol) setControls((p) => ({ ...p, instrument: ref.symbol }));
    if (ref?.timeframe) setControls((p) => ({ ...p, timeframe: ref.timeframe }));
    if (saved?.entryTime) {
      const d = new Date(saved.entryTime);
      if (!Number.isNaN(d.getTime())) {
        setControls((p) => ({ ...p, date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }));
      }
    }
  };

  if (loading || !session) return <p className="bt-muted">{loading ? 'Loading workspace…' : 'Session not found'}</p>;

  const replayClockLabel = currentBar?.time
    ? new Date(Number(currentBar.time) * 1000).toLocaleString()
    : '—';
  const progressPct = candles.length ? Math.round((visibleBars / candles.length) * 100) : 0;

  const ephemeralExpiryLabel = session?.ephemeralExpiresAt
    ? new Date(session.ephemeralExpiresAt).toLocaleString()
    : null;

  return (
    <div className="bt-replay-page">
      {session?.ephemeralExpiresAt ? (
        <div className="aa-card bt-ephemeral-banner" role="status">
          <div>
            <strong>Active session (not saved to library)</strong>
            <p className="aa--muted bt-ephemeral-banner__hint">
              This replay is kept for <strong>24 hours</strong> from when you started it. Save it to your library to keep it permanently. If you do nothing, it is removed automatically after{' '}
              <strong>{ephemeralExpiryLabel || 'expiry'}</strong>.
            </p>
          </div>
          <button type="button" className="bt-btn bt-btn--primary" disabled={persistBusy} onClick={persistSessionToLibrary}>
            {persistBusy ? 'Saving…' : 'Save to library'}
          </button>
        </div>
      ) : null}
      <section className="aa-card bt-replay-controls">
        <div className="bt-replay-controls__head">
          <div>
            <h2 className="aa-section-title-lg">Backtesting Replay Workspace</h2>
            <p className="aa--muted bt-replay-controls__sub">Load historical candles and replay forward without revealing future bars.</p>
          </div>
          <div className="bt-replay-kpis">
            <span className="aa-pill aa-pill--dim">Replay: {playing ? 'Playing' : 'Paused'}</span>
            <span className="aa-pill aa-pill--dim">Progress: {progressPct}%</span>
            <span className="aa-pill aa-pill--dim">Clock: {replayClockLabel}</span>
          </div>
        </div>
        <div className="bt-form-grid bt-replay-controls__grid">
          <div>
            <label className="bt-label">Instrument</label>
            <select className="bt-select" value={controls.instrument} onChange={(e) => setControls((p) => ({ ...p, instrument: e.target.value }))}>
              {(session.instruments?.length ? session.instruments : ['EURUSD', 'GBPUSD', 'XAUUSD']).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="bt-label">Timeframe</label>
            <select className="bt-select" value={controls.timeframe} onChange={(e) => setControls((p) => ({ ...p, timeframe: e.target.value }))}>
              {TIMEFRAMES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="bt-label">Date</label>
            <input className="bt-input" type="date" value={controls.date} onChange={(e) => setControls((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <label className="bt-label">Time</label>
            <input className="bt-input" type="time" value={controls.time} onChange={(e) => setControls((p) => ({ ...p, time: e.target.value }))} />
          </div>
          <div>
            <label className="bt-label">Replay speed</label>
            <select className="bt-select" value={controls.speedMs} onChange={(e) => setControls((p) => ({ ...p, speedMs: Number(e.target.value) }))}>
              {SPEEDS.map((x) => <option key={x} value={x}>{x} ms</option>)}
            </select>
          </div>
        </div>
        <div className="bt-replay-actions">
          <button type="button" className="bt-btn bt-btn--primary" onClick={loadCandles} disabled={busy}>Load</button>
          <button type="button" className="bt-btn" onClick={() => setPlaying(true)} disabled={!candles.length}>Play</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setPlaying(false)} disabled={!candles.length}>Pause</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setCursor((i) => Math.max(0, i - 1))} disabled={!candles.length}>Step back</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setCursor((i) => Math.min(i + 1, candles.length - 1))} disabled={!candles.length}>Step forward</button>
          <button
            type="button"
            className="bt-btn bt-btn--ghost"
            onClick={() => {
              setPlaying(false);
              setCursor(startIndex);
              setChartFitKey((k) => k + 1);
            }}
            disabled={!candles.length}
          >
            Restart
          </button>
        </div>
        {loadError && <p className="bt-inline-err">{loadError}</p>}
      </section>

      <section className="bt-replay-layout">
        <div className="aa-card bt-replay-chart">
          {busy ? (
            <div className="bt-replay-empty">
              <span className="aa-spinner" aria-hidden />
              <p className="aa--muted">Loading historical candles…</p>
            </div>
          ) : !candles.length ? (
            <div className="bt-replay-empty">
              <p className="aa--muted">Choose instrument/time/date and click Load to begin replay.</p>
            </div>
          ) : (
            <>
              <TradeReplayChart
                bars={candles}
                visibleBars={visibleBars}
                currentIndex={cursor}
                fitLayoutKey={chartFitKey}
                replayPlaying={playing}
                openTrades={openTrades}
                closedTrades={closedTrades}
                symbol={controls.instrument}
                interval={controls.timeframe}
                onHoverCandle={setHoverTooltip}
                onSelectCandle={(bar) => {
                  setSelectedBar(bar);
                  setCandleOpen(true);
                }}
                annotations={[
                  { time: Number(currentBar?.time), text: 'Now', shape: 'square', color: '#38bdf8' },
                ]}
              />
              {hoverTooltip ? (
                <p className="bt-field-hint">
                  {hoverTooltip.timeIso} | O:{hoverTooltip.open} H:{hoverTooltip.high} L:{hoverTooltip.low} C:{hoverTooltip.close}
                  {' '}| Δ{hoverTooltip.movePct != null ? `${hoverTooltip.movePct.toFixed(3)}%` : 'n/a'} | Range {hoverTooltip.range.toFixed(5)}
                </p>
              ) : null}
              {cursor >= candles.length - 1 && <p className="bt-field-hint">Replay reached the end of loaded candles. Restart or load another point.</p>}
            </>
          )}
        </div>

        <aside className="aa-card bt-replay-trading">
          <h3 className="aa-section-title">Trading panel</h3>
          <div className="bt-form-grid bt-replay-trading__grid">
            <div>
              <label className="bt-label">Lot size</label>
              <input className="bt-input" type="number" step="0.01" value={ticket.lotSize} onChange={(e) => setTicket((p) => ({ ...p, lotSize: e.target.value }))} />
            </div>
            <div>
              <label className="bt-label">Stop loss (optional)</label>
              <input className="bt-input" value={ticket.stopLoss} onChange={(e) => setTicket((p) => ({ ...p, stopLoss: e.target.value }))} />
            </div>
            <div>
              <label className="bt-label">Take profit (optional)</label>
              <input className="bt-input" value={ticket.takeProfit} onChange={(e) => setTicket((p) => ({ ...p, takeProfit: e.target.value }))} />
            </div>
          </div>
          <div className="bt-replay-trading__actions">
            <button type="button" className="bt-btn bt-btn--primary" onClick={() => placeTrade('long')}>Buy</button>
            <button type="button" className="bt-btn bt-btn--danger" onClick={() => placeTrade('short')}>Sell</button>
          </div>
          <div className="bt-replay-balance">
            <div><span>Balance</span><strong>{fmt(balance)}</strong></div>
            <div><span>Closed PnL</span><strong>{fmt(closedPnl)}</strong></div>
            <div><span>Floating</span><strong>{fmt(markToMarketPnl)}</strong></div>
            <div><span>Equity</span><strong>{fmt(equity)}</strong></div>
          </div>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead><tr><th>Direction</th><th>Entry</th><th>SL/TP</th><th /></tr></thead>
              <tbody>
                {openTrades.length === 0 ? <tr><td colSpan={4}>No open trades.</td></tr> : openTrades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.direction}</td>
                    <td>{fmt(t.entryPrice, 5)}</td>
                    <td>{fmt(t.stopLoss, 5)} / {fmt(t.takeProfit, 5)}</td>
                    <td><button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => closeTrade(t.id)}>Close</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </section>

      <section className="bt-two-col bt-replay-bottom">
        <div className="aa-card bt-replay-ai">
          <h3 className="aa-section-title">AI coaching</h3>
          <div className="bt-replay-ai__log">
            {chatHistory.length === 0 ? <p className="aa--muted">Ask: "Was this a good entry?"</p> : chatHistory.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`bt-replay-chat-line ${m.role === 'user' ? 'bt-replay-chat-line--user' : ''}`}>
                <span>{m.role === 'user' ? 'You' : 'Coach'}:</span> {m.text}
              </div>
            ))}
          </div>
          <div className="bt-replay-ai__composer">
            <input className="bt-input" value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)} placeholder="What would a trader do here?" />
            <button type="button" className="bt-btn bt-btn--primary" disabled={chatBusy} onClick={askCoach}>Ask</button>
          </div>
          <p className="bt-field-hint">Coach context includes symbol, timeframe, visible candles, open trades, and saved trades.</p>
        </div>

        <div className="aa-card bt-replay-saved">
          <h3 className="aa-section-title">Saved trades</h3>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead><tr><th>Instrument</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Lot</th><th>PnL</th><th>Result</th><th>AI</th><th /></tr></thead>
              <tbody>
                {savedTrades.length === 0 ? <tr><td colSpan={9}>No saved trades yet.</td></tr> : savedTrades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.instrument}</td>
                    <td>{t.direction}</td>
                    <td>{fmt(t.entryPrice, 5)}</td>
                    <td>{fmt(t.exitPrice, 5)}</td>
                    <td>{fmt(t.lotSize, 2)}</td>
                    <td>{fmt(t.pnlAmount)}</td>
                    <td>{t.result}</td>
                    <td>{(t.aiFeedback || '').slice(0, 60) || '—'}</td>
                    <td><button type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => loadSavedTradeReplay(t)}>Reopen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bt-replay-saved__actions">
            {closedTrades.length === 0 ? (
              <p className="aa--muted">Close a simulated trade to save it here.</p>
            ) : (
              closedTrades.slice(0, 5).map((t) => (
                <button key={t.id} type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => saveTrade(t)}>
                  Save {t.instrument} {new Date(t.closeTime || t.openTime).toLocaleDateString()}
                </button>
              ))
            )}
          </div>
        </div>
      </section>
      <CandleIntelligencePanel
        open={candleOpen}
        onClose={() => setCandleOpen(false)}
        bar={selectedBar}
        symbol={controls.instrument}
        interval={replayTimeframeToInterval(controls.timeframe)}
      />
    </div>
  );
}
