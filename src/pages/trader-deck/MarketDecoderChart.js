import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import Api from '../../services/Api';
import {
  normalizeChartBars,
  normalizeApiInterval,
  timeScaleOptionsForInterval,
  auraCandlestickSeriesOptions,
} from '../../lib/charts/lightweightChartData';
import { chartHistoryPollIntervalMs } from '../../lib/charts/chartLivePoll';
import {
  AURA_AREA_SERIES_OPTIONS,
  AURA_CANDLE_SERIES_OPTIONS,
  AURA_LINE_SERIES_OPTIONS,
  buildAuraChartOptions,
  getAuraVolumeColor,
} from '../../utils/auraChartTheme';

const MODES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'OHLC bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];

const TIMEFRAMES_REF = ['1H', '4H', '1D', '1W', '1M'];

/** Live chart (Candle timeframe → API `interval`, aligned with `browser-qa-lightweight` DECODER_TFS). */
const CANDLE_TIMEFRAME_BUTTONS = [
  { label: '1m', apiInterval: '1', testId: 'md-candle-tf-1m' },
  { label: '5m', apiInterval: '5', testId: 'md-candle-tf-5m' },
  { label: '15m', apiInterval: '15', testId: 'md-candle-tf-15m' },
  { label: '30m', apiInterval: '30', testId: 'md-candle-tf-30m' },
  { label: '45m', apiInterval: '45', testId: 'md-candle-tf-45m' },
  { label: '1H', apiInterval: '60', testId: 'md-candle-tf-1h' },
  { label: '4H', apiInterval: '240', testId: 'md-candle-tf-4h' },
  { label: '1d', apiInterval: '1D', testId: 'md-candle-tf-1d' },
  { label: '1w', apiInterval: '1W', testId: 'md-candle-tf-1w' },
  { label: '1mo', apiInterval: '1M', testId: 'md-candle-tf-1mo' },
  { label: '1y', apiInterval: '1Y', testId: 'md-candle-tf-1y' },
];

/** Approximate zoom on daily OHLC bars (legacy non-live reference display). */
const TF_VISIBLE_BARS = { '1H': 8, '4H': 16, '1D': 32, '1W': 72, '1M': 400 };

/** Reference terminal: height follows flex slot; clamp for readability. */
function computeReferenceChartHeight(el) {
  const ch = el?.clientHeight;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  if (ch && ch >= 200) {
    return Math.min(680, Math.max(340, ch));
  }
  return Math.min(620, Math.max(340, Math.floor(vh * 0.36)));
}

function ReferenceChartPlaceholder({ sparkline, showGhostTimeframes = true }) {
  const blurId = useId().replace(/:/g, '');
  const hasSpark = Array.isArray(sparkline) && sparkline.length >= 3;
  let pathD = '';
  if (hasSpark) {
    const vals = sparkline.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (vals.length >= 3) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      pathD = vals
        .map((v, i) => {
          const x = (i / (vals.length - 1 || 1)) * 100;
          const y = 8 + (1 - (v - min) / span) * 84;
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
    }
  }
  return (
    <div className="md-chart-root md-chart-root--ref md-chart-root--ref-fill md-chart-root--placeholder">
      {showGhostTimeframes ? (
        <div className="md-chart-tf md-chart-tf--disabled" aria-hidden>
          {TIMEFRAMES_REF.map((tf) => (
            <span key={tf} className="md-chart-tf-btn md-chart-tf-btn--ghost">
              {tf}
            </span>
          ))}
        </div>
      ) : null}
      <div className="md-chart-canvas-wrap md-chart-canvas-wrap--ref-fill md-chart-canvas-wrap--placeholder">
        <div className="md-chart-ph-shimmer" aria-hidden />
        {pathD ? (
          <div className="md-chart-ph-spark-wrap">
            <svg className="md-chart-ph-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <defs>
                <filter id={`md-ph-blur-${blurId}`} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" />
                </filter>
              </defs>
              <path
                d={pathD}
                fill="none"
                stroke="rgba(140, 175, 255, 0.45)"
                strokeWidth="2"
                filter={`url(#md-ph-blur-${blurId})`}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        ) : null}
        <p className="md-chart-ph-cap">OHLC loading — desk feed connecting</p>
      </div>
    </div>
  );
}

function smaFromCandles(candles, period) {
  if (!candles.length || period < 2) return [];
  const out = [];
  for (let i = period - 1; i < candles.length; i += 1) {
    let sum = 0;
    for (let k = 0; k < period; k += 1) sum += candles[i - k].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

const OVERLAY_COLORS = {
  pivot: 'rgba(232, 208, 128, 0.92)',
  resistance: 'rgba(255, 120, 140, 0.78)',
  support: 'rgba(80, 210, 140, 0.78)',
  session: 'rgba(140, 175, 255, 0.82)',
  htf: 'rgba(186, 170, 255, 0.72)',
};

export default function MarketDecoderChart({
  bars,
  /** OANDA:EURUSD, COINBASE:BTCUSD, … for `/api/market/chart-history` (live ref chart). */
  requestSymbol = '',
  /** Daily OHLC from decoder; shown until live fetch returns. */
  seedBars = null,
  compact = false,
  referenceStyle = false,
  overlays = null,
  placeholderSparkline = null,
}) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const liveAbortRef = useRef(null);
  const lastLiveQueryRef = useRef('');
  const [mode, setMode] = useState('candles');
  const [activeTf, setActiveTf] = useState('1D');
  const [candleInterval, setCandleInterval] = useState('60');
  const [liveBars, setLiveBars] = useState(null);
  const useLive = Boolean(referenceStyle && String(requestSymbol || '').trim());

  const refetchLive = useCallback((force = false) => {
    const sym = String(requestSymbol || '').trim();
    if (!sym) return;
    const intervalNorm = normalizeApiInterval(candleInterval);
    const queryKey = `${sym}|${intervalNorm}`;
    if (!force && lastLiveQueryRef.current === queryKey) return;
    if (force) lastLiveQueryRef.current = '';
    lastLiveQueryRef.current = queryKey;
    if (liveAbortRef.current) liveAbortRef.current.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;
    (async () => {
      try {
        const { data } = await Api.getMarketChartHistory(sym, {
          interval: intervalNorm,
          signal: controller.signal,
          ...(force ? { cacheBust: true } : {}),
        });
        const b = data?.bars;
        const normalized = Array.isArray(b) ? normalizeChartBars(b) : [];
        if (typeof console !== 'undefined' && console.debug) {
          const first = normalized[0];
          const last = normalized[normalized.length - 1];
          console.debug('[AuraChart]', {
            scope: 'MarketDecoder',
            symbol: sym,
            interval: intervalNorm,
            range: 'auto',
            barCount: normalized.length,
            firstBarTime: first?.time,
            lastBarTime: last?.time,
          });
        }
        if (normalized.length >= 2) {
          setLiveBars(normalized);
        } else {
          setLiveBars([]);
        }
      } catch (e) {
        if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
        setLiveBars([]);
      }
    })();
  }, [requestSymbol, candleInterval]);

  useEffect(() => {
    if (!useLive) return;
    setLiveBars(null);
    const t = setTimeout(() => refetchLive(false), 380);
    return () => {
      clearTimeout(t);
      lastLiveQueryRef.current = '';
      if (liveAbortRef.current) liveAbortRef.current.abort();
    };
  }, [useLive, refetchLive]);

  useEffect(() => {
    if (!useLive) return undefined;
    const ms = chartHistoryPollIntervalMs(normalizeApiInterval(candleInterval));
    if (!ms || ms < 8000) return undefined;
    const id = window.setInterval(() => {
      lastLiveQueryRef.current = '';
      refetchLive(true);
    }, ms);
    return () => window.clearInterval(id);
  }, [useLive, refetchLive, candleInterval]);

  const seed = seedBars && Array.isArray(seedBars) && seedBars.length >= 2 ? seedBars : null;
  const base = bars && Array.isArray(bars) && bars.length >= 2 ? bars : null;
  const displayBars = useLive
    ? (liveBars && liveBars.length >= 2
        ? liveBars
        : liveBars && liveBars.length === 0
          ? null
          : seed || base)
    : base;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !displayBars || displayBars.length < 2) return undefined;
    const bForChart = displayBars;

    let height;
    if (referenceStyle) {
      height = computeReferenceChartHeight(el);
    } else {
      const baseH =
        typeof window !== 'undefined' ? window.innerHeight * (compact ? 0.2 : 0.28) : compact ? 220 : 320;
      height = Math.min(compact ? 260 : 400, Math.max(compact ? 180 : 260, Math.floor(baseH)));
    }

    const scaleInterval = useLive ? normalizeApiInterval(candleInterval) : '1D';
    const chart = createChart(
      el,
      buildAuraChartOptions({
        ColorType,
        width: el.clientWidth,
        height,
        attributionLogo: true,
        timeScale: {
          ...timeScaleOptionsForInterval(scaleInterval),
        },
      })
    );
    chartRef.current = chart;

    const data = normalizeChartBars(bForChart);

    const lineData = data.map((b) => ({ time: b.time, value: b.close }));

    if (referenceStyle) {
      const s = chart.addCandlestickSeries({
        ...AURA_CANDLE_SERIES_OPTIONS,
        ...auraCandlestickSeriesOptions(requestSymbol),
      });
      s.setData(data);
      const volumeData = data
        .map((b, idx) => ({
          time: b.time,
          value: Number(bForChart[idx]?.volume),
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
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volSeries.setData(volumeData);
      }
      if (overlays?.horizontalLevels?.length) {
        overlays.horizontalLevels.forEach((lv) => {
          if (lv.price == null || Number.isNaN(Number(lv.price))) return;
          try {
            s.createPriceLine({
              price: Number(lv.price),
              title: String(lv.label || ''),
              color: OVERLAY_COLORS[lv.kind] || 'rgba(140, 175, 255, 0.55)',
              lineWidth: lv.kind === 'pivot' ? 2 : 1,
              lineStyle: lv.kind === 'session' ? 2 : 0,
              axisLabelVisible: true,
            });
          } catch {
            /* ignore overlay errors */
          }
        });
      }
      if (data.length >= 5) {
        const ma = smaFromCandles(data, Math.min(21, Math.max(5, Math.floor(data.length / 4))));
        if (ma.length) {
          const maSeries = chart.addLineSeries({
            color: 'rgba(140, 175, 255, 0.75)',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          maSeries.setData(ma);
        }
      }
    } else if (mode === 'candles') {
      const s = chart.addCandlestickSeries({
        ...AURA_CANDLE_SERIES_OPTIONS,
        ...auraCandlestickSeriesOptions(requestSymbol),
      });
      s.setData(data);
      const volumeData = data
        .map((b, idx) => ({
          time: b.time,
          value: Number(bForChart[idx]?.volume),
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
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volSeries.setData(volumeData);
      }
    } else if (mode === 'bars') {
      const s = chart.addBarSeries({
        upColor: '#56e3a7',
        downColor: '#ff7e91',
        thinBars: false,
      });
      s.setData(data);
    } else if (mode === 'line') {
      const s = chart.addLineSeries(AURA_LINE_SERIES_OPTIONS);
      s.setData(lineData);
    } else {
      const s = chart.addAreaSeries(AURA_AREA_SERIES_OPTIONS);
      s.setData(lineData);
    }

    if (referenceStyle && data.length > 0 && !useLive) {
      const zoomBars = TF_VISIBLE_BARS[activeTf] ?? 32;
      const right = data.length - 1;
      const from = Math.max(0, right - zoomBars + 1);
      try {
        chart.timeScale().setVisibleLogicalRange({ from, to: right });
      } catch {
        chart.timeScale().fitContent();
      }
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            chart.timeScale().fitContent();
          } catch {
            /* ignore */
          }
        });
      });
    }

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const w = wrapRef.current.clientWidth;
      if (referenceStyle) {
        const h = computeReferenceChartHeight(wrapRef.current);
        chartRef.current.applyOptions({ width: w, height: h });
      } else {
        chartRef.current.applyOptions({ width: w });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [displayBars, mode, compact, referenceStyle, activeTf, overlays, useLive, candleInterval]);

  if (!displayBars || displayBars.length < 2) {
    if (referenceStyle && useLive) {
      return (
        <div className="md-chart-root md-chart-root--ref md-chart-root--ref-fill">
          <div className="md-chart-tf" role="tablist" aria-label="Candle timeframe">
            {CANDLE_TIMEFRAME_BUTTONS.map((c) => (
              <button
                key={c.apiInterval}
                type="button"
                role="tab"
                aria-selected={candleInterval === c.apiInterval}
                data-testid={c.testId}
                className={`md-chart-tf-btn${candleInterval === c.apiInterval ? ' md-chart-tf-btn--active' : ''}`}
                onClick={() => {
                  setCandleInterval(c.apiInterval);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="md-chart-canvas-wrap md-chart-canvas-wrap--ref-fill">
            {seed || placeholderSparkline ? (
              <ReferenceChartPlaceholder sparkline={placeholderSparkline} showGhostTimeframes={false} />
            ) : (
              <p className="md-decoder-small md-mse-note">Loading chart data…</p>
            )}
          </div>
        </div>
      );
    }
    if (referenceStyle) {
      return <ReferenceChartPlaceholder sparkline={placeholderSparkline} />;
    }
    return (
      <div className={`md-chart-empty${referenceStyle ? ' md-chart-empty--ref' : ''}`}>
        <p className="md-decoder-small">
          Chart history is still loading for this symbol. The rest of the brief is valid; rerun Decode shortly for full OHLC
          view.
        </p>
      </div>
    );
  }

  return (
    <div className={`md-chart-root${referenceStyle ? ' md-chart-root--ref md-chart-root--ref-fill' : ''}`}>
      {!referenceStyle ? (
        <div className="md-chart-toolbar" role="toolbar" aria-label="Chart display mode">
          {MODES.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`md-chart-mode${mode === x.id ? ' md-chart-mode--on' : ''}`}
              onClick={() => setMode(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      ) : useLive ? (
        <>
          <div className="md-chart-tf" role="tablist" aria-label="Candle timeframe">
            {CANDLE_TIMEFRAME_BUTTONS.map((c) => (
              <button
                key={c.apiInterval}
                type="button"
                role="tab"
                aria-selected={candleInterval === c.apiInterval}
                data-testid={c.testId}
                className={`md-chart-tf-btn${candleInterval === c.apiInterval ? ' md-chart-tf-btn--active' : ''}`}
                onClick={() => {
                  setCandleInterval(c.apiInterval);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="md-chart-tf" role="tablist" aria-label="Timeframe (display)">
          {TIMEFRAMES_REF.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={activeTf === tf}
              className={`md-chart-tf-btn${activeTf === tf ? ' md-chart-tf-btn--active' : ''}`}
              onClick={() => setActiveTf(tf)}
              title="Chart data is daily OHLC; tabs match desk layout."
            >
              {tf}
            </button>
          ))}
        </div>
      )}
      <div
        ref={wrapRef}
        className={`md-chart-canvas-wrap${referenceStyle ? ' md-chart-canvas-wrap--ref-fill' : ''}`}
      />
      <p className="md-chart-attrib">
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
          Lightweight Charts
        </a>{' '}
        © TradingView (Apache 2.0)
      </p>
    </div>
  );
}
