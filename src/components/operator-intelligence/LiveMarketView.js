import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { FaChartLine } from 'react-icons/fa';
import { fetchOperatorChartPack } from '../../services/operatorIntelligenceAdapter';
import { timeScaleOptionsForInterval } from '../../lib/charts/lightweightChartData';
import {
  TERMINAL_INSTRUMENT_OPTIONS,
  terminalInstrumentLabel,
} from '../../data/terminalInstruments';

const TIMEFRAMES = [
  { id: '1m', label: '1m', api: '1' },
  { id: '5m', label: '5m', api: '5' },
  { id: '15m', label: '15m', api: '15' },
  { id: '1H', label: '1H', api: '60' },
  { id: '4H', label: '4H', api: '240' },
  { id: 'D', label: 'D', api: '1D' },
  { id: 'W', label: 'W', api: '1W' },
];

function chartPixelHeight(wrapEl) {
  const rect = wrapEl?.getBoundingClientRect?.();
  const fromRect = rect && rect.height > 80 ? Math.floor(rect.height) : 0;
  if (fromRect) return Math.min(640, Math.max(320, fromRect));
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.min(620, Math.max(340, Math.floor(vh * 0.44)));
}

function chartPixelWidth(wrapEl) {
  let w = wrapEl?.clientWidth || 0;
  if (w < 64) w = wrapEl?.getBoundingClientRect?.().width || 0;
  if (w < 64) w = wrapEl?.parentElement?.clientWidth || 0;
  return Math.max(120, Math.floor(w));
}

/**
 * Central live market chart — mock bars via adapter; candle click surfaces intelligence.
 * @param {{ symbol: string, onSelectCandle: (bar: object) => void, onSymbolChange?: (s: string) => void }} props
 */
export default function LiveMarketView({ symbol, onSelectCandle, onSymbolChange }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const barsRef = useRef([]);
  const onSelectCandleRef = useRef(onSelectCandle);
  onSelectCandleRef.current = onSelectCandle;

  const [tf, setTf] = useState('1H');
  const [sym, setSym] = useState(symbol || TERMINAL_INSTRUMENT_OPTIONS[0]?.value || 'OANDA:EURUSD');
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [pack, setPack] = useState(null);
  const [lastPrice, setLastPrice] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setErr('');
    setPack(null);
    try {
      const data = await fetchOperatorChartPack(sym, tf);
      const bars = data?.bars;
      if (!bars || bars.length < 2) {
        setPack(null);
        setLastPrice('');
        setStatus('error');
        setErr('Insufficient chart data.');
        return;
      }
      setPack(data);
      const last = bars[bars.length - 1];
      setLastPrice(last && Number.isFinite(last.close) ? String(last.close) : '');
      setStatus('ready');
    } catch (e) {
      setPack(null);
      setLastPrice('');
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

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || status !== 'ready' || !pack?.bars || pack.bars.length < 2) {
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          /* ignore */
        }
        chartRef.current = null;
      }
      return undefined;
    }

    let ro = null;
    let cancelled = false;
    let layoutAttempts = 0;

    const mountChart = () => {
      if (cancelled || !wrapRef.current) return;
      layoutAttempts += 1;
      if (layoutAttempts > 60) return;
      const wrapEl = wrapRef.current;
      const w = chartPixelWidth(wrapEl);
      const h = chartPixelHeight(wrapEl);
      if (w < 80 || h < 120) {
        requestAnimationFrame(mountChart);
        return;
      }

      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          /* ignore */
        }
        chartRef.current = null;
      }

      const bg = '#070a10';
      const gridGold = 'rgba(212, 175, 55, 0.06)';
      const tfRow = TIMEFRAMES.find((t) => t.id === tf);
      const scaleIv = tf === 'W' ? '1D' : tfRow?.api || '60';

      const chart = createChart(wrapEl, {
        width: w,
        height: h,
        layout: {
          background: { type: ColorType.Solid, color: bg },
          textColor: 'rgba(230, 220, 200, 0.88)',
          /* Logo cell intercepts pointer events and breaks candle hit-testing / e2e clicks */
          attributionLogo: false,
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
        if (!param?.point) return;
        let bar = null;
        const seriesMap = param.seriesData;
        if (seriesMap && typeof seriesMap.forEach === 'function') {
          seriesMap.forEach((pt) => {
            if (bar || !pt || typeof pt.time !== 'number') return;
            if (!('open' in pt) || !('high' in pt)) return;
            bar = barsRef.current.find((b) => b.time === pt.time) || null;
          });
        }
        if (!bar) {
          let t = typeof param.time === 'number' ? param.time : null;
          if (t == null) {
            const mapped = chart.timeScale().coordinateToTime(param.point.x);
            t = typeof mapped === 'number' ? mapped : null;
          }
          if (t != null) bar = barsRef.current.find((b) => b.time === t) || null;
        }
        if (!bar && barsRef.current.length) {
          const mapped = chart.timeScale().coordinateToTime(param.point.x);
          const tx = typeof mapped === 'number' ? mapped : null;
          if (tx != null) {
            let best = barsRef.current[0];
            let bestD = Math.abs(best.time - tx);
            for (const b of barsRef.current) {
              const d = Math.abs(b.time - tx);
              if (d < bestD) {
                best = b;
                bestD = d;
              }
            }
            const step = Math.max(
              60,
              ...barsRef.current.slice(1, 4).map((b, i) => Math.abs(b.time - barsRef.current[i].time)),
            );
            if (bestD <= step * 2.5) bar = best;
          }
        }
        if (bar) onSelectCandleRef.current?.(bar);
      };
      chart.subscribeClick(clickHandler);
      chart.__oiClickHandler = clickHandler;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            chart.timeScale().fitContent();
          } catch {
            /* ignore */
          }
        });
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(mountChart);
    });

    ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const nw = chartPixelWidth(wrapRef.current);
      const nh = chartPixelHeight(wrapRef.current);
      chartRef.current.applyOptions({ width: nw, height: nh });
    });
    ro.observe(wrap);

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      const c = chartRef.current;
      if (c) {
        try {
          if (c.__oiClickHandler) c.unsubscribeClick(c.__oiClickHandler);
        } catch {
          /* ignore */
        }
        try {
          c.remove();
        } catch {
          /* ignore */
        }
        chartRef.current = null;
      }
    };
  }, [pack, status, tf]);

  const symLabel = terminalInstrumentLabel(sym);

  return (
    <div className="oi-card oi-card--chart oi-card--chart-focal">
      <div className="oi-card__head oi-card__head--chart">
        <div className="oi-chart-title">
          <FaChartLine className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">Live market view</span>
          {lastPrice ? (
            <span className="oi-chart-price" aria-live="polite">
              {symLabel} <strong>{lastPrice}</strong>
            </span>
          ) : null}
        </div>
        <div className="oi-chart-controls">
          <label className="oi-sr-only" htmlFor="oi-symbol-select">
            Symbol
          </label>
          <select
            id="oi-symbol-select"
            data-testid="oi-symbol-select"
            className="oi-select oi-select--instrument"
            value={sym}
            onChange={(e) => {
              const v = e.target.value;
              setSym(v);
              onSymbolChange?.(v);
            }}
          >
            {TERMINAL_INSTRUMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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

      <div className="oi-chart-stage">
        <div ref={wrapRef} className="oi-chart-frame" data-testid="oi-chart-mount" />
        {status === 'loading' ? (
          <div className="oi-chart-loading" aria-busy="true" aria-live="polite">
            <span className="oi-chart-loading__ring" aria-hidden />
            <span className="oi-chart-loading__text">Loading chart…</span>
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="oi-chart-error" role="alert">
            {err || 'Chart unavailable'}
          </div>
        ) : null}
      </div>

      <div className="oi-chart-foot">
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
          Lightweight Charts
        </a>
        <span>© TradingView (Apache 2.0)</span>
      </div>
    </div>
  );
}
