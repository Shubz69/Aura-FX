import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import Api from '../../services/Api';
import {
  normalizeChartBars,
  normalizeApiInterval,
  timeScaleOptionsForInterval,
  auraCandlestickSeriesOptions,
  auraChartVisualOptions,
} from '../../lib/charts/lightweightChartData';
import { chartHistoryPollIntervalMs } from '../../lib/charts/chartLivePoll';
import {
  AURA_CANDLE_SERIES_OPTIONS,
  buildAuraChartOptions,
  getAuraVolumeColor,
} from '../../utils/auraChartTheme';

// REPLACE the entire computeChartHeight function:
function computeChartHeight(containerEl, fillParent, fixedHeight) {
  if (fixedHeight != null && Number.isFinite(Number(fixedHeight))) return Math.max(200, Number(fixedHeight));
  
  const el = containerEl;
  const ch = el?.clientHeight;
  
  if (fillParent) {
    if (ch && ch >= 200) return ch;  // ← Use actual height, NO max cap (was Math.min(920, ...))
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    return Math.floor(vh * 0.5);
  }
  
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.min(620, Math.max(320, Math.floor(vh * 0.36)));
}

/**
 * Candlestick chart from `/api/market/chart-history` for Trader Lab / Replay slots.
 * Matches Market Decoder reference styling; keeps Lightweight Charts attribution.
 */
export default function LightweightInstrumentChart({
  symbol,
  interval = '60',
  range = '',
  from = '',
  to = '',
  fillParent = false,
  height,
  className = 'trader-suite-chart-frame',
  showTradingViewLink = true,
  /** Periodically refetch OHLC so the last candle stays aligned with the server. */
  liveRefresh = true,
  /** Override auto poll interval (ms); 0 disables timed refetch (live quote stream may still update last bar). */
  pollIntervalMs = null,
  onDataLoaded,
}) {
  const rootRef = useRef(null);
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const liveBarRef = useRef(null);
  const liveEventSourceRef = useRef(null);
  const onDataLoadedRef = useRef(onDataLoaded);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [bars, setBars] = useState(null);
  const [pollTick, setPollTick] = useState(0);

  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  useEffect(() => {
    setPollTick(0);
  }, [symbol, interval, range, from, to]);

  const resolvedPollMs =
    pollIntervalMs != null && Number.isFinite(Number(pollIntervalMs))
      ? Math.max(0, Number(pollIntervalMs))
      : chartHistoryPollIntervalMs(normalizeApiInterval(interval));

  useEffect(() => {
    if (!liveRefresh || resolvedPollMs <= 0) return undefined;
    const id = window.setInterval(() => {
      setPollTick((n) => n + 1);
    }, resolvedPollMs);
    return () => window.clearInterval(id);
  }, [liveRefresh, resolvedPollMs, symbol, interval]);

  useEffect(() => {
    let cancelled = false;
    const sym = String(symbol || '').trim();
    if (!sym) {
      setStatus('empty');
      setBars(null);
      setErrorMessage('No symbol');
      return undefined;
    }
    const intervalNorm = normalizeApiInterval(interval);
    const rangeNorm = String(range || '');
    const fromNorm = String(from || '').trim();
    const toNorm = String(to || '').trim();
    const bust = pollTick > 0;
    if (!bust) {
      setStatus('loading');
      setBars(null);
    }
    setErrorMessage('');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Api.getMarketChartHistory(sym, {
        interval: intervalNorm,
        ...(rangeNorm ? { range: rangeNorm } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        signal: controller.signal,
        ...(bust ? { cacheBust: true } : {}),
      })
        .then((res) => {
          if (cancelled) return;
          const data = res?.data;
          const list = Array.isArray(data?.bars) ? data.bars : [];
          const normalized = normalizeChartBars(list);
          if (!data?.success || normalized.length < 2) {
            const diag = data?.diagnostics;
            if (diag && typeof console !== 'undefined' && console.warn) {
              console.warn('[LightweightInstrumentChart] chart empty or insufficient bars', diag);
            }
            setStatus('empty');
            setErrorMessage(data?.message || 'Not enough chart data for this symbol yet.');
            setBars(null);
            return;
          }
          if (typeof console !== 'undefined' && console.debug) {
            const first = normalized[0];
            const last = normalized[normalized.length - 1];
            console.debug('[AuraChart]', {
              scope: 'LightweightInstrumentChart',
              symbol: sym,
              interval: intervalNorm,
              range: rangeNorm || 'auto',
              barCount: normalized.length,
              firstBarTime: first?.time,
              lastBarTime: last?.time,
              pollRefresh: bust,
            });
          }
          if (typeof onDataLoadedRef.current === 'function') {
            const first = normalized[0] || null;
            const last = normalized[normalized.length - 1] || null;
            onDataLoadedRef.current({
              symbol: sym,
              interval: intervalNorm,
              range: rangeNorm,
              latestClose: Number.isFinite(Number(last?.close)) ? Number(last.close) : null,
              firstBarTime: first?.time ?? null,
              lastBarTime: last?.time ?? null,
              barCount: normalized.length,
            });
          }
          setBars(normalized);
          setStatus('ready');
        })
        .catch((err) => {
          if (cancelled) return;
          if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
          const diag = err?.response?.data?.diagnostics;
          if (diag && typeof console !== 'undefined' && console.warn) {
            console.warn('[LightweightInstrumentChart] chart request failed', diag);
          }
          setStatus('error');
          setBars(null);
          setErrorMessage(err?.response?.data?.message || err?.message || 'Chart failed to load');
        });
    }, 420);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbol, interval, range, from, to, pollTick]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || status !== 'ready' || !bars || bars.length < 2) return undefined;

    const h = computeChartHeight(rootRef.current, fillParent, height);
    const intervalNorm = normalizeApiInterval(interval);
    const visual = auraChartVisualOptions();
const chart = createChart(
  wrap,
  buildAuraChartOptions({
    ColorType,
    width: wrap.clientWidth,
    height: h,
    attributionLogo: true,
    ...visual,
    // ── Disable built-in scroll/zoom — we handle it manually ──
    handleScroll: {
      vertTouchDrag: true,
      horzTouchDrag: true,
      mouseWheel: false,         // ← Plain wheel = page scroll
      pressedMouseMove: true,    // ← Drag to pan
    },
    handleScale: {
      axisPressedMouseMove: false,
      mouseWheel: false,         // ← Plain wheel = page scroll
      pinch: true,               // ← Pinch zoom still works
    },
    timeScale: {
      ...(visual.timeScale || {}),
      ...timeScaleOptionsForInterval(intervalNorm),
    },
  })
);
chartRef.current = chart;

// ── ADD: Modifier key wheel handler ──
const handleWheel = (e) => {
  const ch = chartRef.current;
  if (!ch) return;

  // Ctrl/Cmd + Wheel = Zoom
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    const timeScale = ch.timeScale();
    const currentRange = timeScale.getVisibleRange();
    if (!currentRange) return;
    const range = currentRange.to - currentRange.from;
    const mid = (currentRange.from + currentRange.to) / 2;
    const zoomFactor = e.deltaY < 0 ? 0.88 : 1.12;
    const newHalfRange = (range * zoomFactor) / 2;
    timeScale.setVisibleRange({ from: mid - newHalfRange, to: mid + newHalfRange });
    return;
  }

  // Shift + Wheel = Pan horizontally
  if (e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const timeScale = ch.timeScale();
    const currentRange = timeScale.getVisibleRange();
    if (!currentRange) return;
    const range = currentRange.to - currentRange.from;
    const panAmount = range * 0.25 * (e.deltaY > 0 ? 1 : -1);
    timeScale.setVisibleRange({ from: currentRange.from + panAmount, to: currentRange.to + panAmount });
    return;
  }

  // Alt + Wheel = Pan vertically
  if (e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    const priceScale = ch.priceScale('right');
    if (!priceScale) return;
    const currentRange = priceScale.getVisibleRange();
    if (!currentRange) return;
    const priceRange = currentRange.to - currentRange.from;
    const panAmount = priceRange * 0.20 * (e.deltaY > 0 ? -1 : 1);
    priceScale.applyOptions({ autoScale: false });
    priceScale.setVisibleRange({ from: currentRange.from + panAmount, to: currentRange.to + panAmount });
    return;
  }
  // Plain wheel = page scroll (do nothing)
};
wrap.addEventListener('wheel', handleWheel, { passive: false });
chart.__oiWheelHandler = handleWheel;

    const data = bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const series = chart.addCandlestickSeries({
      ...AURA_CANDLE_SERIES_OPTIONS,
      ...auraCandlestickSeriesOptions(symbol),
    });
    series.setData(data);
    candleSeriesRef.current = series;
    liveBarRef.current = data.length > 0 ? { ...data[data.length - 1] } : null;
    const volumeData = bars
      .map((b) => ({
        time: b.time,
        value: Number(b.volume),
        color: getAuraVolumeColor(b.open, b.close),
      }))
      .filter((v) => Number.isFinite(v.value) && v.value > 0);
    if (volumeData.length > 0) {
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volSeries.setData(volumeData);
    }
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
  const w = wrapRef.current.clientWidth;
  const nextH = computeChartHeight(rootRef.current, fillParent, height);
  // Only resize if dimensions actually changed significantly
  const currentW = chartRef.current.options?.width;
  const currentH = chartRef.current.options?.height;
  if (Math.abs(currentW - w) > 2 || Math.abs(currentH - nextH) > 2) {
    chartRef.current.applyOptions({ width: w, height: nextH });
  }
});
ro.observe(wrap);

return () => {
  ro.disconnect();
  if (chart.__oiWheelHandler) {
    wrap.removeEventListener('wheel', chart.__oiWheelHandler);
  }
  candleSeriesRef.current = null;
  liveBarRef.current = null;
  chart.remove();
  chartRef.current = null;
};
  }, [bars, status, fillParent, height, interval]);

  useEffect(() => {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym || status !== 'ready') return undefined;
    if (typeof EventSource === 'undefined') return undefined;

    let es = null;
    const openStream = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (es) return;
      const base = Api.getBaseUrl()?.replace(/\/$/, '') || window.location.origin;
      es = new EventSource(`${base}/api/market/live-quotes-stream?symbols=${encodeURIComponent(sym)}`);
      liveEventSourceRef.current = es;
      es.addEventListener('quote', (evt) => {
        try {
          const quote = JSON.parse(evt.data || '{}');
          const px = Number(quote?.price);
          if (!Number.isFinite(px) || px <= 0 || !candleSeriesRef.current || !liveBarRef.current) return;
          const next = { ...liveBarRef.current };
          next.close = px;
          if (px > next.high) next.high = px;
          if (px < next.low) next.low = px;
          liveBarRef.current = next;
          candleSeriesRef.current.update(next);
        } catch (_) {
          // Ignore malformed live quote payloads.
        }
      });
    };

    const closeStream = () => {
      if (!es) return;
      try {
        es.close();
      } catch {
        // ignore
      }
      if (liveEventSourceRef.current === es) liveEventSourceRef.current = null;
      es = null;
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        closeStream();
      } else {
        openStream();
      }
    };

    openStream();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      closeStream();
    };
  }, [symbol, status]);

  const tradingViewHref =
    symbol && showTradingViewLink
      ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(String(symbol).trim())}`
      : null;

  const minH = fillParent ? 'clamp(340px, 50vh, 920px)' : height != null ? `${Math.max(200, Number(height))}px` : '340px';

  if (status === 'loading') {
    return (
      <div
        ref={rootRef}
        className={className}
        style={{
          minHeight: minH,
          height: fillParent ? '100%' : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 14,
        }}
      >
        Loading chart…
      </div>
    );
  }

  if (status === 'error' || status === 'empty') {
    return (
      <div
        ref={rootRef}
        className={className}
        style={{
          minHeight: minH,
          height: fillParent ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          color: 'rgba(255,255,255,0.6)',
          fontSize: 14,
          padding: '12px 16px',
          textAlign: 'center',
        }}
      >
        <span>{errorMessage || 'Chart unavailable'}</span>
        {tradingViewHref ? (
          <a href={tradingViewHref} target="_blank" rel="noopener noreferrer" style={{ color: '#e8c468', fontSize: 13 }}>
            Open in TradingView
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        minHeight: fillParent ? minH : undefined,
        height: fillParent ? '100%' : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <div ref={wrapRef} style={{ flex: fillParent ? '1 1 auto' : 'none', width: '100%', minHeight: 200 }} />
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 2px 0',
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        <span>
          © TradingView (Apache 2.0) · data delayed
        </span>
        {tradingViewHref ? (
          <a href={tradingViewHref} target="_blank" rel="noopener noreferrer" style={{ color: '#c9a05c' }}>
            Full chart on TradingView
          </a>
        ) : null}
      </div>
    </div>
  );
}
