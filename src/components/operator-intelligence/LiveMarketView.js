import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { FaChartLine } from 'react-icons/fa';
import Api from '../../services/Api';
import {
  auraCandlestickSeriesOptions,
  auraChartVisualOptions,
  normalizeChartBars,
  timeScaleOptionsForInterval,
} from '../../lib/charts/lightweightChartData';
import { computeSessionLevels } from '../../data/operatorIntelligence/chartBars.mock';
import {
  TERMINAL_INSTRUMENTS,
  TERMINAL_INSTRUMENT_CATEGORIES,
  getInstrumentByChartSymbol,
  chartSymbolFromId,
  terminalInstrumentLabel,
} from '../../data/terminalInstruments';

const TIMEFRAMES = [
  { id: '1m', label: '1m', api: '1' },
  { id: '5m', label: '5m', api: '5' },
  { id: '15m', label: '15m', api: '15' },
  { id: '1H', label: '1H', api: '60' },
  { id: '4H', label: '4H', api: '240' },
  { id: '1D', label: '1D', api: '1D' },
  { id: '1W', label: '1W', api: '1W' },
  { id: '1M', label: '1M', api: '1M' },
];

const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', '10Y', '20Y', '50Y'];

function asIsoDate(sec) {
  const x = Number(sec);
  if (!Number.isFinite(x)) return 'n/a';
  return new Date(x * 1000).toISOString().slice(0, 10);
}

function diagnosticsFromPayload(payload, bars, requestedRange, requestedInterval) {
  const d = payload?.diagnostics || {};
  return {
    providerUsed: d.providerUsed || d.provider || 'unknown',
    interval: d.requestedInterval || requestedInterval,
    range: d.requestedRange || requestedRange,
    effectiveInterval: d.effectiveInterval || requestedInterval,
    chunksFetched: Number.isFinite(Number(d.chunksFetched)) ? Number(d.chunksFetched) : 0,
    fallbackReason: d.fallbackReason || '',
    barCount: bars.length,
    firstDate: asIsoDate(bars[0]?.time),
    lastDate: asIsoDate(bars[bars.length - 1]?.time),
  };
}

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
 * Central live market chart — powered by /api/market/chart-history.
 * @param {{ symbol: string, onSelectCandle: (bar: object) => void, onSymbolChange?: (s: string) => void }} props
 */
export default function LiveMarketView({ symbol, onSelectCandle, onSymbolChange }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const barsRef = useRef([]);
  const onSelectCandleRef = useRef(onSelectCandle);
  onSelectCandleRef.current = onSelectCandle;

  const [tf, setTf] = useState('1H');
  const [range, setRange] = useState('1Y');
  const [symbolQuery, setSymbolQuery] = useState('');
  const initialInstrument = getInstrumentByChartSymbol(symbol) || TERMINAL_INSTRUMENTS[0] || null;
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(initialInstrument?.id || 'EURUSD');
  const sym = chartSymbolFromId(selectedInstrumentId);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [pack, setPack] = useState(null);
  const [lastPrice, setLastPrice] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);

  const loadSeqRef = useRef(0);
  const abortRef = useRef(null);

  const filteredInstruments = TERMINAL_INSTRUMENTS.filter((inst) => {
    if (!symbolQuery.trim()) return true;
    const q = symbolQuery.trim().toLowerCase();
    return (
      inst.id.toLowerCase().includes(q)
      || inst.label.toLowerCase().includes(q)
      || inst.category.toLowerCase().includes(q)
    );
  });

  const groupedInstruments = TERMINAL_INSTRUMENT_CATEGORIES.map((category) => ({
    category,
    rows: filteredInstruments.filter((x) => x.category === category),
  })).filter((group) => group.rows.length > 0);

  const load = useCallback(async () => {
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const tfRow = TIMEFRAMES.find((t) => t.id === tf);
    const requestedInterval = tfRow?.api || '60';
    setStatus('loading');
    setErr('');
    setPack(null);
    setDiagnostics(null);
    try {
      const response = await Api.getMarketChartHistory(sym, {
        interval: requestedInterval,
        range,
        signal: controller.signal,
      });
      if (seq !== loadSeqRef.current) return;
      const payload = response?.data || {};
      const bars = normalizeChartBars(payload?.bars);
      if (!bars || bars.length < 2) {
        setPack(null);
        setLastPrice('');
        setDiagnostics(null);
        setStatus('error');
        setErr('No data available for selected instrument.');
        return;
      }
      setPack({
        bars,
        levels: computeSessionLevels(bars),
      });
      const last = bars[bars.length - 1];
      setLastPrice(last && Number.isFinite(last.close) ? String(last.close) : '');
      const diag = diagnosticsFromPayload(payload, bars, range, requestedInterval);
      setDiagnostics(diag);
      console.info('[OperatorIntelligence][ChartHistory]', {
        symbol: sym,
        requestedInterval,
        requestedRange: range,
        ...diag,
      });
      setStatus('ready');
    } catch (e) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      if (seq !== loadSeqRef.current) return;
      setPack(null);
      setLastPrice('');
      setDiagnostics(null);
      setErr(e?.message || 'Chart load failed');
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [range, sym, tf]);

  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    if (!symbol) return;
    const next = getInstrumentByChartSymbol(symbol);
    if (next?.id && next.id !== selectedInstrumentId) setSelectedInstrumentId(next.id);
  }, [symbol, selectedInstrumentId]);

  useEffect(() => {
    onSymbolChange?.(sym);
  }, [sym, onSymbolChange]);

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

      const tfRow = TIMEFRAMES.find((t) => t.id === tf);
      const scaleIv = tfRow?.api || '60';
      const visual = auraChartVisualOptions();

      const chart = createChart(wrapEl, {
        width: w,
        height: h,
        ...visual,
        layout: {
          ...(visual.layout || {}),
          background: visual.layout?.background || { type: ColorType.Solid, color: '#070b14' },
          /* Logo cell intercepts pointer events and breaks candle hit-testing / e2e clicks */
          attributionLogo: false,
        },
        timeScale: {
          ...(visual.timeScale || {}),
          ...timeScaleOptionsForInterval(scaleIv),
        },
      });
      chartRef.current = chart;

      const data = normalizeChartBars(pack.bars);
      barsRef.current = pack.bars;

      const candleSeries = chart.addCandlestickSeries(auraCandlestickSeriesOptions());
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
          <input
            className="oi-input oi-input--search"
            type="search"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder="Search instruments..."
            aria-label="Search instruments"
          />
          <select
            id="oi-symbol-select"
            data-testid="oi-symbol-select"
            className="oi-select oi-select--instrument"
            value={selectedInstrumentId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedInstrumentId(id);
              onSymbolChange?.(chartSymbolFromId(id));
            }}
          >
            {groupedInstruments.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.rows.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {`${inst.id} — ${inst.label} (${inst.category})`}
                  </option>
                ))}
              </optgroup>
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
          <div className="oi-tf-bar" role="toolbar" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`oi-tf-btn${range === r ? ' is-active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="oi-chart-hint">
        Click a candle for intelligence.
        {diagnostics ? (
          <>
            {' '}
            Live {diagnostics.providerUsed} | {diagnostics.interval}/{diagnostics.range}
            {' '}| effective {diagnostics.effectiveInterval} | bars {diagnostics.barCount}
            {' '}| {diagnostics.firstDate} to {diagnostics.lastDate} | chunks {diagnostics.chunksFetched}
            {diagnostics.fallbackReason ? ` | fallback: ${diagnostics.fallbackReason}` : ''}
          </>
        ) : null}
      </p>

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
