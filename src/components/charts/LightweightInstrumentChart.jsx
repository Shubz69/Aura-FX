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
import {
  AURA_CANDLE_SERIES_OPTIONS,
  buildAuraChartOptions,
  getAuraVolumeColor,
} from '../../utils/auraChartTheme';

function computeChartHeight(containerEl, fillParent, fixedHeight) {
  if (fixedHeight != null && Number.isFinite(Number(fixedHeight))) return Math.max(200, Number(fixedHeight));
  const el = containerEl;
  const ch = el?.clientHeight;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  if (fillParent) {
    if (ch && ch >= 200) return Math.min(920, Math.max(340, ch));
    return Math.min(920, Math.max(400, Math.floor(vh * 0.5)));
  }
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
  onDataLoaded,
}) {
  const rootRef = useRef(null);
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const liveBarRef = useRef(null);
  const liveEventSourceRef = useRef(null);
  const onDataLoadedRef = useRef(onDataLoaded);
  const lastQueryKeyRef = useRef('');
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [bars, setBars] = useState(null);

  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

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
    const queryKey = JSON.stringify({ sym, interval: intervalNorm });
    if (lastQueryKeyRef.current === queryKey) {
      return undefined;
    }
    lastQueryKeyRef.current = queryKey;
    setStatus('loading');
    setErrorMessage('');
    setBars(null);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Api.getMarketChartHistory(sym, {
        interval: intervalNorm,
        ...(rangeNorm ? { range: rangeNorm } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        signal: controller.signal,
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
  }, [symbol, interval]);

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
        timeScale: {
          ...(visual.timeScale || {}),
          ...timeScaleOptionsForInterval(intervalNorm),
        },
      })
    );
    chartRef.current = chart;

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
      chartRef.current.applyOptions({ width: w, height: nextH });
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
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
    const base = Api.getBaseUrl()?.replace(/\/$/, '') || window.location.origin;
    const es = new EventSource(`${base}/api/market/live-quotes-stream?symbols=${encodeURIComponent(sym)}`);
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

    return () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      if (liveEventSourceRef.current === es) liveEventSourceRef.current = null;
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
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
            Lightweight Charts
          </a>{' '}
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
