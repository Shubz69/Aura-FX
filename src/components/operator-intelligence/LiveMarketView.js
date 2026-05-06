import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createChart, ColorType } from 'lightweight-charts';
import { FaChartLine } from 'react-icons/fa';
import { fetchOperatorChartPack } from '../../services/operatorIntelligenceAdapter';
import {
  auraCandlestickSeriesOptions,
  auraChartVisualOptions,
  normalizeChartBars,
  timeScaleOptionsForInterval,
} from '../../lib/charts/lightweightChartData';
import {
  TERMINAL_INSTRUMENTS,
  TERMINAL_INSTRUMENT_CATEGORIES,
  getInstrumentByChartSymbol,
  chartSymbolFromId,
  dataSymbolFromId,
  terminalInstrumentLabel,
} from '../../data/terminalInstruments';
import { formatCandleTooltip } from '../../lib/charts/candleIntelligence';

const TIMEFRAMES = [
  { id: '1m', label: '1m', api: '1' },
  { id: '5m', label: '5m', api: '5' },
  { id: '15m', label: '15m', api: '15' },
  { id: '30m', label: '30m', api: '30' },
  { id: '45m', label: '45m', api: '45' },
  { id: '1H', label: '1H', api: '60' },
  { id: '4H', label: '4H', api: '240' },
  { id: '1D', label: '1D', api: '1D' },
  { id: '1W', label: '1W', api: '1W' },
  { id: '1mo', label: '1mo', api: '1M' },
  { id: '1y', label: '1y', api: '1Y' },
];

function asIsoDate(sec) {
  const x = Number(sec);
  if (!Number.isFinite(x)) return 'n/a';
  return new Date(x * 1000).toISOString().slice(0, 10);
}

function diagnosticsFromPayload(payload, bars, requestedInterval) {
  const d = payload?.diagnostics || {};
  return {
    providerUsed: d.providerUsed || d.provider || 'unknown',
    interval: d.requestedInterval || requestedInterval,
    range: d.requestedRange || 'auto',
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
  if (rect && rect.height > 80) return Math.floor(rect.height);
  const parent = wrapEl?.parentElement;
  if (parent) {
    const parentRect = parent.getBoundingClientRect();
    if (parentRect.height > 80) return Math.floor(parentRect.height);
  }
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.floor(vh * 0.44);
}

/** Poll chart-history so the last candle moves with the market; interval scales with timeframe. */
function chartPollIntervalMs(tfId) {
  switch (tfId) {
    case '1m':
      return 12_000;
    case '5m':
      return 18_000;
    case '15m':
    case '30m':
    case '45m':
      return 32_000;
    case '1H':
      return 55_000;
    case '4H':
      return 120_000;
    case '1D':
      return 240_000;
    case '1W':
    case '1mo':
    case '1y':
      return 600_000;
    default:
      return 55_000;
  }
}

function chartPixelWidth(wrapEl) {
  let w = wrapEl?.clientWidth || 0;
  if (w < 64) w = wrapEl?.getBoundingClientRect?.().width || 0;
  if (w < 64) w = wrapEl?.parentElement?.clientWidth || 0;
  if (w < 64) w = wrapEl?.parentElement?.getBoundingClientRect?.().width || 0;
  return Math.max(120, Math.floor(w));
}

export default function LiveMarketView({ symbol, onSelectCandle, onSymbolChange }) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const barsRef = useRef([]);
  const onSelectCandleRef = useRef(onSelectCandle);
  onSelectCandleRef.current = onSelectCandle;

  const [tf, setTf] = useState('1H');
  const [symbolQuery, setSymbolQuery] = useState('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(() => {
    const inst = getInstrumentByChartSymbol(symbol) || TERMINAL_INSTRUMENTS[0];
    return inst && inst.id ? inst.id : 'EURUSD';
  });
  const cleanChartSymbol = chartSymbolFromId(selectedInstrumentId);
  const cleanDataSymbol = dataSymbolFromId(selectedInstrumentId);
  const symLabel = terminalInstrumentLabel(cleanChartSymbol);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [pack, setPack] = useState(null);
  const [lastPrice, setLastPrice] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);
  const [hoverTooltip, setHoverTooltip] = useState(null);

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

  const load = useCallback(async (loadOpts = {}) => {
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
      const data = await fetchOperatorChartPack(cleanDataSymbol || selectedInstrumentId, tf, {
        cacheBust: Boolean(loadOpts.cacheBust),
      });
      if (controller.signal.aborted) return;
      if (seq !== loadSeqRef.current) return;
      const bars = normalizeChartBars(data?.bars);
      if (!bars || bars.length < 2) {
        setPack(null);
        setLastPrice('');
        setDiagnostics(null);
        setStatus('error');
        setErr(t('operatorIntelligence.liveMarket.noData'));
        return;
      }
      setPack({ bars, levels: data?.levels || null });
      const last = bars[bars.length - 1];
      setLastPrice(last && Number.isFinite(last.close) ? String(last.close) : '');
      setDiagnostics(diagnosticsFromPayload({ diagnostics: data?.diagnostics || {} }, bars, requestedInterval));
      setStatus('ready');
    } catch (e) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      if (seq !== loadSeqRef.current) return;
      setPack(null);
      setLastPrice('');
      setDiagnostics(null);
      setErr(e?.message || t('operatorIntelligence.liveMarket.loadFailed'));
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [cleanChartSymbol, cleanDataSymbol, selectedInstrumentId, tf, t]);

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
    if (status !== 'ready') return undefined;
    const ms = chartPollIntervalMs(tf);
    const id = window.setInterval(() => {
      load({ cacheBust: true });
    }, ms);
    return () => window.clearInterval(id);
  }, [tf, load, status]);

  useEffect(() => {
    if (!symbol) return;
    const next = getInstrumentByChartSymbol(symbol);
    if (next?.id && next.id !== selectedInstrumentId) setSelectedInstrumentId(next.id);
  }, [symbol, selectedInstrumentId]);

  useEffect(() => {
    onSymbolChange?.(cleanChartSymbol);
  }, [cleanChartSymbol, onSymbolChange]);

// ── Professional wheel handler ──
// Ctrl/Cmd + Wheel = Zoom | Shift + Wheel = Pan H | Alt + Wheel = Pan V | Drag = Pan
useEffect(() => {
  const wrap = wrapRef.current;
  if (!wrap || status !== 'ready') return;

  const handleWheel = (e) => {
    const chart = chartRef.current;
    if (!chart) return;

    // ── Ctrl/Cmd + Wheel = Zoom in/out ──
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      
      const timeScale = chart.timeScale();
      const currentRange = timeScale.getVisibleRange();
      if (!currentRange) return;
      
      const range = currentRange.to - currentRange.from;
      const mid = (currentRange.from + currentRange.to) / 2;
      const zoomFactor = e.deltaY < 0 ? 0.88 : 1.12;
      const newHalfRange = (range * zoomFactor) / 2;
      
      timeScale.setVisibleRange({
        from: mid - newHalfRange,
        to: mid + newHalfRange,
      });
      return;
    }

    // ── Shift + Wheel = Pan horizontally (scroll through time) ──
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      
      const timeScale = chart.timeScale();
      const currentRange = timeScale.getVisibleRange();
      if (!currentRange) return;
      
      const range = currentRange.to - currentRange.from;
      const panAmount = range * 0.25 * (e.deltaY > 0 ? 1 : -1);
      
      timeScale.setVisibleRange({
        from: currentRange.from + panAmount,
        to: currentRange.to + panAmount,
      });
      return;
    }

    // ── Alt/Option + Wheel = Pan vertically (scroll price up/down) ──
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      
      // Get the main price scale (candlestick series)
      const priceScale = chart.priceScale('right');
      if (!priceScale) return;
      
      const currentRange = priceScale.getVisibleRange();
      if (!currentRange) return;
      
      const priceRange = currentRange.to - currentRange.from;
      // Pan 20% of visible price range per scroll tick
      const panAmount = priceRange * 0.20 * (e.deltaY > 0 ? -1 : 1);
      
      priceScale.applyOptions({
        autoScale: false, // Disable auto-scale when manually panning
      });
      
      priceScale.setVisibleRange({
        from: currentRange.from + panAmount,
        to: currentRange.to + panAmount,
      });
      return;
    }

    // Plain wheel = page scroll (do nothing, let it pass)
  };

  wrap.addEventListener('wheel', handleWheel, { passive: false });
  
  return () => {
    wrap.removeEventListener('wheel', handleWheel);
  };
}, [status, tf]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || status !== 'ready' || !pack?.bars || pack.bars.length < 2) {
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch { /* ignore */ }
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
        try { chartRef.current.remove(); } catch { /* ignore */ }
        chartRef.current = null;
      }

      const tfRow = TIMEFRAMES.find((t) => t.id === tf);
      const scaleIv = tfRow?.api || '60';
      const visual = auraChartVisualOptions();

   const chart = createChart(wrapEl, {
  width: w,
  height: h,
  ...visual,
  handleScroll: {
    vertTouchDrag: true,          // ← Enable vertical touch drag
    horzTouchDrag: true,          // ← Enable horizontal touch drag
    mouseWheel: false,
    pressedMouseMove: true,       // ← Enable mouse drag to pan
  },
  handleScale: {
    axisPressedMouseMove: false,
    mouseWheel: false,
    pinch: true,
  },
        layout: {
          ...(visual.layout || {}),
          background: visual.layout?.background || { type: ColorType.Solid, color: '#070b14' },
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

      const candleSeries = chart.addCandlestickSeries(auraCandlestickSeriesOptions(cleanChartSymbol));
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
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });

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
        } catch { /* ignore */ }
      });

      const last = data[data.length - 1];
      if (last) {
        try {
          candleSeries.setMarkers([{
            time: last.time,
            position: 'aboveBar',
            color: '#e8c468',
            shape: 'circle',
            text: String(last.close),
          }]);
        } catch { /* ignore */ }
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
              if (d < bestD) { best = b; bestD = d; }
            }
            const step = Math.max(60, ...barsRef.current.slice(1, 4).map((b, i) => Math.abs(b.time - barsRef.current[i].time)));
            if (bestD <= step * 2.5) bar = best;
          }
        }
        if (bar) {
          onSelectCandleRef.current?.({ ...bar, symbol: cleanChartSymbol, interval: scaleIv, instrument: symLabel });
        }
      };
      chart.subscribeClick(clickHandler);
      chart.__oiClickHandler = clickHandler;

      const crosshairHandler = (param) => {
        let bar = null;
        const seriesMap = param?.seriesData;
        if (seriesMap && typeof seriesMap.forEach === 'function') {
          seriesMap.forEach((pt) => {
            if (bar || !pt || typeof pt.time !== 'number') return;
            if (!('open' in pt) || !('high' in pt)) return;
            bar = barsRef.current.find((b) => b.time === pt.time) || null;
          });
        }
        setHoverTooltip(formatCandleTooltip({ bar, symbol: cleanChartSymbol, interval: scaleIv }));
      };
      chart.subscribeCrosshairMove(crosshairHandler);
      chart.__oiCrosshairHandler = crosshairHandler;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try { chart.timeScale().fitContent(); } catch { /* ignore */ }
        });
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(mountChart);
      });
    });

    ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const nw = chartPixelWidth(wrapRef.current);
      const nh = chartPixelHeight(wrapRef.current);
      if (nw > 50 && nh > 100) {
        chartRef.current.applyOptions({ width: nw, height: nh });
      }
    });
    ro.observe(wrap);

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      const c = chartRef.current;
      if (c) {
        try {
          if (c.__oiClickHandler) c.unsubscribeClick(c.__oiClickHandler);
          if (c.__oiCrosshairHandler) c.unsubscribeCrosshairMove(c.__oiCrosshairHandler);
        } catch { /* ignore */ }
        try { c.remove(); } catch { /* ignore */ }
        chartRef.current = null;
      }
    };
  }, [pack, status, tf, cleanChartSymbol, symLabel]);

  return (
    <div className="oi-card oi-card--chart oi-card--chart-focal">
      <div className="oi-card__head oi-card__head--chart">
        <div className="oi-chart-title">
          <FaChartLine className="oi-card__icon" aria-hidden />
          <span className="oi-card__title">{t('operatorIntelligence.liveMarket.title')}</span>
          {lastPrice ? (
            <span className="oi-chart-price" aria-live="polite">
              {symLabel} <strong>{lastPrice}</strong>
            </span>
          ) : null}
        </div>
        <div className="oi-chart-controls">
          <label className="oi-sr-only" htmlFor="oi-symbol-select">Symbol</label>
          <input
            className="oi-input oi-input--search"
            type="search"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder={t('operatorIntelligence.liveMarket.searchPlaceholder')}
            aria-label={t('operatorIntelligence.liveMarket.searchAria')}
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
          <div className="oi-tf-bar" role="toolbar" aria-label={t('operatorIntelligence.liveMarket.timeframe')}>
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
     <p className="oi-chart-hint">
  {t('operatorIntelligence.liveMarket.clickCandle')}
  <span style={{ color: 'rgba(200,210,230,0.4)', marginLeft: 8 }}>
    — {navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'} + scroll zoom · Shift + scroll ↔ · {navigator?.platform?.includes('Mac') ? '⌥' : 'Alt'} + scroll ↕ · drag to pan
  </span>
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
        {hoverTooltip ? (
          <div className="oi-chart-hint" style={{ position: 'absolute', left: 12, top: 12, zIndex: 4, background: 'rgba(9,12,18,0.88)', padding: '6px 8px', borderRadius: 8, fontSize: 12 }}>
            {hoverTooltip.timeIso} | O:{hoverTooltip.open} H:{hoverTooltip.high} L:{hoverTooltip.low} C:{hoverTooltip.close}
            {' '}| Δ{hoverTooltip.movePct != null ? `${hoverTooltip.movePct.toFixed(3)}%` : 'n/a'}
            {' '}| R:{hoverTooltip.range.toFixed(5)}
            {hoverTooltip.volume != null ? ` | V:${hoverTooltip.volume}` : ''}
            {' '}| {hoverTooltip.symbol} {hoverTooltip.interval}
          </div>
        ) : null}
        {status === 'loading' ? (
          <div className="oi-chart-loading" aria-busy="true" aria-live="polite">
            <span className="oi-chart-loading__ring" aria-hidden />
            <span className="oi-chart-loading__text">{t('operatorIntelligence.liveMarket.loadingChart')}</span>
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="oi-chart-error" role="alert">
            {err || t('operatorIntelligence.liveMarket.chartUnavailable')}
          </div>
        ) : null}
      </div>

      <div className="oi-chart-foot">
        <span>© TradingView (Apache 2.0)</span>
      </div>
    </div>
  );
}