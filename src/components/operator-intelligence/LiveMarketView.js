import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { FaChartLine } from 'react-icons/fa';
import { fetchOperatorChartPack } from '../../services/operatorIntelligenceAdapter';
import { timeScaleOptionsForInterval } from '../../lib/charts/lightweightChartData';

const TIMEFRAMES = [
  { id: '1m', label: '1m', api: '1' },
  { id: '5m', label: '5m', api: '5' },
  { id: '15m', label: '15m', api: '15' },
  { id: '1H', label: '1H', api: '60' },
  { id: '4H', label: '4H', api: '240' },
  { id: 'D', label: 'D', api: '1D' },
  { id: 'W', label: 'W', api: '1W' },
];

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];

function chartHeight(el) {
  const ch = el?.clientHeight;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  if (ch && ch >= 200) return Math.min(560, Math.max(320, ch));
  return Math.min(520, Math.max(300, Math.floor(vh * 0.42)));
}

/**
 * Central live market chart — mock bars via adapter; candle click surfaces intelligence.
 * @param {{ symbol: string, onSelectCandle: (bar: object) => void, onSymbolChange?: (s: string) => void }} props
 */
export default function LiveMarketView({ symbol, onSelectCandle, onSymbolChange }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const barsRef = useRef([]);
  const [tf, setTf] = useState('1H');
  const [sym, setSym] = useState(symbol || 'EURUSD');
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [pack, setPack] = useState(null);
  const [lastPrice, setLastPrice] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setErr('');
    try {
      const data = await fetchOperatorChartPack(sym, tf);
      setPack(data);
      const last = data?.bars?.[data.bars.length - 1];
      setLastPrice(last && Number.isFinite(last.close) ? String(last.close) : '');
      setStatus('ready');
    } catch (e) {
      setPack(null);
      setErr(e?.message || 'Chart load failed');
      setStatus('error');
    }
  }, [sym, tf]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (symbol && symbol !== sym) setSym(symbol);
  }, [symbol, sym]);

  useEffect(() => {
    onSymbolChange?.(sym);
  }, [sym, onSymbolChange]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || status !== 'ready' || !pack?.bars || pack.bars.length < 2) return undefined;

    const bg = '#070a10';
    const gridGold = 'rgba(212, 175, 55, 0.06)';
    const h = chartHeight(wrap.parentElement);
    const tfRow = TIMEFRAMES.find((t) => t.id === tf);
    const scaleIv = tf === 'W' ? '1D' : tfRow?.api || '60';

    const chart = createChart(wrap, {
      width: wrap.clientWidth,
      height: h,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: 'rgba(230, 220, 200, 0.88)',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: gridGold },
        horzLines: { color: gridGold },
      },
      timeScale: {
        borderColor: 'rgba(212,175,55,0.14)',
        ...timeScaleOptionsForInterval(scaleIv === '1W' ? '1D' : scaleIv),
      },
      rightPriceScale: { borderColor: 'rgba(212,175,55,0.14)' },
    });
    chartRef.current = chart;

    const data = pack.bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    barsRef.current = pack.bars;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#3dd68c',
      downColor: '#ff6b81',
      borderUpColor: '#3dd68c',
      borderDownColor: '#ff6b81',
      wickUpColor: '#3dd68c',
      wickDownColor: '#ff6b81',
    });
    candleSeries.setData(data);

    const volData = pack.bars.map((b) => ({
      time: b.time,
      value: b.volume || 0,
      color: b.close >= b.open ? 'rgba(61, 214, 140, 0.35)' : 'rgba(255, 107, 129, 0.35)',
    }));
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    volSeries.setData(volData);
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.06, bottom: 0.22 },
    });

    const lv = pack.levels || {};
    const lineLevels = [
      { price: lv.rangeHigh, title: 'Range high', color: 'rgba(248, 195, 125, 0.75)' },
      { price: lv.vah, title: 'VAH', color: 'rgba(140, 200, 255, 0.65)' },
      { price: lv.val, title: 'VAL', color: 'rgba(140, 200, 255, 0.65)' },
      { price: lv.rangeLow, title: 'Range low', color: 'rgba(248, 195, 125, 0.75)' },
    ];
    lineLevels.forEach((ln) => {
      if (ln.price == null || !Number.isFinite(Number(ln.price))) return;
      try {
        candleSeries.createPriceLine({
          price: Number(ln.price),
          title: ln.title,
          color: ln.color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
        });
      } catch {
        /* ignore */
      }
    });

    const last = data[data.length - 1];
    if (last) {
      try {
        candleSeries.setMarkers([
          {
            time: last.time,
            position: 'aboveBar',
            color: '#e8c468',
            shape: 'circle',
            text: String(last.close),
          },
        ]);
      } catch {
        /* ignore */
      }
    }

    const clickHandler = (param) => {
      if (!param?.time || !param.point || !onSelectCandle) return;
      const t = typeof param.time === 'number' ? param.time : null;
      if (t == null) return;
      const bar = barsRef.current.find((b) => b.time === t);
      if (bar) onSelectCandle(bar);
    };
    chart.subscribeClick(clickHandler);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          chart.timeScale().fitContent();
        } catch {
          /* ignore */
        }
      });
    });

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const nextH = chartHeight(wrapRef.current.parentElement);
      chartRef.current.applyOptions({ width: wrapRef.current.clientWidth, height: nextH });
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      chart.unsubscribeClick(clickHandler);
      chart.remove();
      chartRef.current = null;
    };
  }, [pack, status, tf, onSelectCandle]);

  return (
    <div className="oi-card oi-card--chart">
      <div className="oi-card__head oi-card__head--chart">
        <div className="oi-chart-title">
          <FaChartLine className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">Live market view</span>
          {lastPrice ? (
            <span className="oi-chart-price" aria-live="polite">
              {sym} <strong>{lastPrice}</strong>
            </span>
          ) : null}
        </div>
        <div className="oi-chart-controls">
          <label className="oi-sr-only" htmlFor="oi-symbol-select">
            Symbol
          </label>
          <select
            id="oi-symbol-select"
            className="oi-select"
            value={sym}
            onChange={(e) => setSym(e.target.value)}
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="oi-tf-bar" role="toolbar" aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`oi-tf-btn${tf === t.id ? ' is-active' : ''}`}
                onClick={() => setTf(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="oi-chart-hint">Click a candle for intelligence. Mock data — adapter ready for live feed.</p>
      {status === 'loading' ? (
        <div className="oi-chart-frame oi-chart-frame--msg">Loading chart…</div>
      ) : null}
      {status === 'error' ? (
        <div className="oi-chart-frame oi-chart-frame--msg">{err || 'Chart error'}</div>
      ) : null}
      {status === 'ready' ? <div ref={wrapRef} className="oi-chart-frame" /> : null}
      <div className="oi-chart-foot">
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
          Lightweight Charts
        </a>
        <span>© TradingView (Apache 2.0)</span>
      </div>
    </div>
  );
}
