import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import TradeReplayChart from '../../components/trader-replay/TradeReplayChart';
import '../../styles/backtesting/Backtesting.css';

const SPEEDS = [250, 500, 900, 1400, 2200];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function fmt(v, d = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '—';
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
    return openTrades.reduce((acc, t) => {
      const entry = Number(t.entryPrice);
      const lots = Number(t.positionSize || 0);
      if (!Number.isFinite(entry)) return acc;
      const raw = t.direction === 'short' ? (entry - px) * lots : (px - entry) * lots;
      return acc + raw;
    }, 0);
  }, [currentBar?.close, openTrades]);

  const closedPnl = useMemo(
    () => closedTrades.reduce((acc, t) => acc + Number(t.pnlAmount || 0), 0),
    [closedTrades]
  );
  const equity = useMemo(
    () => Number(session?.initialBalance || 0) + closedPnl + markToMarketPnl,
    [closedPnl, markToMarketPnl, session?.initialBalance]
  );

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
    const [sRes, tRes, svRes] = await Promise.all([
      Api.getBacktestingSession(sessionId),
      Api.getBacktestingSessionTrades(sessionId),
      Api.listBacktestingSavedTrades(),
    ]);
    if (sRes.data?.success) setSession(sRes.data.session);
    if (tRes.data?.success) setAllTrades(tRes.data.trades || []);
    if (svRes.data?.success) setSavedTrades(svRes.data.trades || []);
    const s = sRes.data?.session;
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
      try {
        await refreshSessionData();
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Could not load backtesting workspace');
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
      toast.error(e?.response?.data?.message || 'Failed to load candles');
    } finally {
      setBusy(false);
    }
  };

  const placeTrade = async (direction) => {
    const entry = Number(currentBar?.close);
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
        lotSize: Number(ticket.lotSize) || 0.1,
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

  const closeTrade = async (tradeId) => {
    const px = Number(currentBar?.close);
    if (!Number.isFinite(px)) return;
    try {
      await Api.closeBacktestingReplayTrade(sessionId, tradeId, {
        exitPrice: px,
        closeTime: new Date(Number(currentBar.time) * 1000).toISOString(),
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

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="aa-card">
        <h2 className="aa-section-title-lg">Backtesting Replay Workspace</h2>
        <div className="bt-form-grid">
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
        <div className="bt-hero-actions" style={{ marginTop: 10 }}>
          <button type="button" className="bt-btn bt-btn--primary" onClick={loadCandles} disabled={busy}>Load</button>
          <button type="button" className="bt-btn" onClick={() => setPlaying(true)} disabled={!candles.length}>Play</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setPlaying(false)}>Pause</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setCursor((i) => Math.max(0, i - 1))} disabled={!candles.length}>Step back</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => setCursor((i) => Math.min(i + 1, candles.length - 1))} disabled={!candles.length}>Step forward</button>
          <button type="button" className="bt-btn bt-btn--ghost" onClick={() => { setPlaying(false); setCursor(startIndex); }} disabled={!candles.length}>Restart</button>
        </div>
      </div>

      <div className="aa-card">
        {!candles.length ? (
          <p className="aa--muted">Load candles to start replay.</p>
        ) : (
          <TradeReplayChart
            bars={candles}
            visibleBars={visibleBars}
            currentIndex={cursor}
            openTrades={openTrades}
            closedTrades={closedTrades}
            annotations={[
              { time: Number(currentBar?.time), text: 'Now', shape: 'square', color: '#38bdf8' },
            ]}
          />
        )}
      </div>

      <div className="bt-two-col">
        <div className="aa-card">
          <h3 className="aa-section-title">Trading panel</h3>
          <div className="bt-form-grid">
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
          <div className="bt-hero-actions" style={{ marginTop: 10 }}>
            <button type="button" className="bt-btn bt-btn--primary" onClick={() => placeTrade('long')}>Buy</button>
            <button type="button" className="bt-btn bt-btn--danger" onClick={() => placeTrade('short')}>Sell</button>
          </div>
          <p className="aa--muted" style={{ marginTop: 12 }}>
            Balance: {fmt(session.initialBalance)} | Closed PnL: {fmt(closedPnl)} | Floating: {fmt(markToMarketPnl)} | Equity: {fmt(equity)}
          </p>
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
        </div>

        <div className="aa-card">
          <h3 className="aa-section-title">AI coaching</h3>
          <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto', marginBottom: 8 }}>
            {chatHistory.length === 0 ? <p className="aa--muted">Ask: "Was this a good entry?"</p> : chatHistory.map((m, i) => (
              <div key={`${m.role}-${i}`} className="aa-pill aa-pill--dim">{m.role === 'user' ? 'You' : 'Coach'}: {m.text}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="bt-input" value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)} placeholder="What would a trader do here?" />
            <button type="button" className="bt-btn bt-btn--primary" disabled={chatBusy} onClick={askCoach}>Ask</button>
          </div>
        </div>
      </div>

      <div className="aa-card">
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
        <div className="bt-hero-actions" style={{ marginTop: 10 }}>
          {closedTrades.slice(0, 5).map((t) => (
            <button key={t.id} type="button" className="bt-btn bt-btn--ghost bt-btn--sm" onClick={() => saveTrade(t)}>
              Save {t.instrument} {new Date(t.closeTime || t.openTime).toLocaleDateString()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
