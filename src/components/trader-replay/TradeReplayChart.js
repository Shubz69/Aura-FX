import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import {
  auraCandlestickSeriesOptions,
  auraChartVisualOptions,
} from '../../lib/charts/lightweightChartData';
import { formatCandleTooltip } from '../../lib/charts/candleIntelligence';

function toMarkerColor(direction) {
  return direction === 'buy' ? '#10b981' : '#ef4444';
}

/** @typedef {{ id: string, kind: 'hline'|'vline'|'entry'|'sl'|'tp', price?: number, time?: number }} UserDrawing */

const TOOLS = [
  { id: 'select', label: 'Crosshair', title: 'Select / crosshair' },
  { id: 'hline', label: 'H', title: 'Horizontal line' },
  { id: 'vline', label: 'V', title: 'Vertical line' },
  { id: 'entry', label: 'Entry', title: 'Entry line' },
  { id: 'sl', label: 'SL', title: 'Stop loss line' },
  { id: 'tp', label: 'TP', title: 'Take profit line' },
];

export default function TradeReplayChart({
  bars,
  visibleBars,
  trade,
  currentIndex,
  fitLayoutKey: fitLayoutKeyProp,
  recenterKey = 0,
  recenterTargetTime = null,
  openTrades = [],
  closedTrades = [],
  annotations = [],
  symbol,
  interval = '15',
  onHoverCandle,
  onSelectCandle,
}) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const tradeLineHandlesRef = useRef([]);
  const userPriceLineHandlesRef = useRef([]);
  const userVlineSeriesRef = useRef([]);
  const hasFittedOnceRef = useRef(false);
  const lastAppliedFitLayoutKeyRef = useRef(null);
  const lastAppliedRecenterKeyRef = useRef(0);

  const [activeTool, setActiveTool] = useState('select');
  const [drawings, setDrawings] = useState([]);

  const currentBars = useMemo(() => {
    if (!Array.isArray(bars) || !bars.length) return [];
    const cap = Math.max(1, Math.min(bars.length, Number(visibleBars) || bars.length));
    return bars.slice(0, cap);
  }, [bars, visibleBars]);

  const clearDrawings = useCallback(() => setDrawings([]), []);

  const removeAllUserGraphics = useCallback(() => {
    const series = candleRef.current;
    if (series) {
      userPriceLineHandlesRef.current.forEach((handle) => {
        try {
          series.removePriceLine(handle);
        } catch (_) {
          /* noop */
        }
      });
      userPriceLineHandlesRef.current = [];
    }
    const chart = chartRef.current;
    if (chart) {
      userVlineSeriesRef.current.forEach((ls) => {
        try {
          chart.removeSeries(ls);
        } catch (_) {
          /* noop */
        }
      });
      userVlineSeriesRef.current = [];
    }
  }, []);

  /** Create chart once per symbol/interval callbacks */
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    hasFittedOnceRef.current = false;
    lastAppliedFitLayoutKeyRef.current = null;
    lastAppliedRecenterKeyRef.current = 0;

    const chart = createChart(wrapRef.current, {
      width: wrapRef.current.clientWidth,
      height: 420,
      ...auraChartVisualOptions(),
      timeScale: {
        ...(auraChartVisualOptions().timeScale || {}),
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;
    candleRef.current = chart.addCandlestickSeries({
      ...auraCandlestickSeriesOptions(symbol),
    });

    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !wrapRef.current) return;
      chartRef.current.applyOptions({ width: wrapRef.current.clientWidth });
    });
    ro.observe(wrapRef.current);

    return () => {
      ro.disconnect();
      try {
        chart.remove();
      } catch (_) {
        /* noop */
      }
      chartRef.current = null;
      candleRef.current = null;
      tradeLineHandlesRef.current = [];
      userPriceLineHandlesRef.current = [];
      userVlineSeriesRef.current = [];
    };
  }, [symbol, interval]);

  /** Click: candle select vs drawing placement */
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return undefined;

    const clickHandler = (param) => {
      if (!param?.point || !candleRef.current) return;

      if (activeTool === 'select') {
        let selected = null;
        const seriesMap = param?.seriesData;
        if (seriesMap && typeof seriesMap.forEach === 'function') {
          seriesMap.forEach((pt) => {
            if (selected || !pt || typeof pt.time !== 'number') return;
            if (!('open' in pt)) return;
            selected = {
              time: pt.time,
              open: pt.open,
              high: pt.high,
              low: pt.low,
              close: pt.close,
            };
          });
        }
        if (selected) {
          onSelectCandle?.({
            ...selected,
            symbol,
            interval,
          });
        }
        return;
      }

      if (activeTool === 'hline' || activeTool === 'entry' || activeTool === 'sl' || activeTool === 'tp') {
        const price = candleRef.current.coordinateToPrice(param.point.y);
        if (!Number.isFinite(price)) return;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `hl-${Date.now()}-${Math.random()}`;
        setDrawings((prev) => [...prev, { id, kind: activeTool === 'hline' ? 'hline' : activeTool, price }]);
        return;
      }

      if (activeTool === 'vline') {
        let t = typeof param.time === 'number' ? param.time : null;
        const seriesMap = param?.seriesData;
        if (t == null && seriesMap?.forEach) {
          seriesMap.forEach((pt) => {
            if (t == null && pt && typeof pt.time === 'number' && 'open' in pt) t = pt.time;
          });
        }
        if (t == null) return;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `vl-${Date.now()}-${Math.random()}`;
        setDrawings((prev) => [...prev, { id, kind: 'vline', time: t }]);
      }
    };

    chart.subscribeClick(clickHandler);

    const hoverHandler = (param) => {
      let selected = null;
      const seriesMap = param?.seriesData;
      if (seriesMap && typeof seriesMap.forEach === 'function') {
        seriesMap.forEach((pt) => {
          if (selected || !pt || typeof pt.time !== 'number') return;
          if (!('open' in pt)) return;
          selected = {
            time: pt.time,
            open: pt.open,
            high: pt.high,
            low: pt.low,
            close: pt.close,
          };
        });
      }
      onHoverCandle?.(formatCandleTooltip({ bar: selected, symbol, interval }));
    };
    chart.subscribeCrosshairMove(hoverHandler);

    return () => {
      try {
        chart.unsubscribeClick(clickHandler);
        chart.unsubscribeCrosshairMove(hoverHandler);
      } catch (_) {
        /* noop */
      }
    };
  }, [symbol, interval, activeTool, onHoverCandle, onSelectCandle]);

  /** Update candle data without resetting zoom except when fitLayoutKey changes */
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return undefined;

    const ts = chart.timeScale();
    const len = currentBars.length;
    if (len === 0) {
      series.setData([]);
      return undefined;
    }

    const resolvedFitKey =
      fitLayoutKeyProp === undefined || fitLayoutKeyProp === null ? null : Number(fitLayoutKeyProp);
    const wantsFullFit =
      resolvedFitKey != null && lastAppliedFitLayoutKeyRef.current !== resolvedFitKey;
    const wantsRecenter = lastAppliedRecenterKeyRef.current !== recenterKey;

    let savedRange = null;
    if (hasFittedOnceRef.current && !wantsFullFit && !wantsRecenter) {
      try {
        savedRange = ts.getVisibleLogicalRange();
      } catch (_) {
        savedRange = null;
      }
    }

    series.setData(currentBars);
    const recenterTs = Number(recenterTargetTime);

    requestAnimationFrame(() => {
      try {
        const span = 40;
        if (wantsFullFit) {
          ts.fitContent();
          hasFittedOnceRef.current = true;
          lastAppliedFitLayoutKeyRef.current = resolvedFitKey;
        } else if (wantsRecenter) {
          if (Number.isFinite(recenterTs) && len > 0) {
            const ti = currentBars.findIndex((b) => Number(b.time) >= recenterTs);
            const cIdx = ti >= 0 ? ti : Math.floor(len / 2);
            let from = Math.max(0, cIdx - span);
            let to = Math.min(len - 1 + 1e-6, cIdx + span);
            if (to <= from) to = Math.min(len - 1 + 1e-6, from + 8);
            ts.setVisibleLogicalRange({ from, to });
            hasFittedOnceRef.current = true;
          }
          lastAppliedRecenterKeyRef.current = recenterKey;
        } else if (
          hasFittedOnceRef.current
          && savedRange
          && Number.isFinite(savedRange.from)
          && Number.isFinite(savedRange.to)
        ) {
          const hi = Math.max(0, len - 1 + 1e-6);
          let from = Math.max(0, savedRange.from);
          let to = Math.min(savedRange.to, hi);
          if (to <= from) to = Math.min(hi, from + 4);
          ts.setVisibleLogicalRange({ from, to });
        } else if (!hasFittedOnceRef.current) {
          ts.fitContent();
          hasFittedOnceRef.current = true;
        }
      } catch (_) {
        /* noop */
      }
    });

    return undefined;
  }, [currentBars, fitLayoutKeyProp, recenterKey, recenterTargetTime]);

  /** Simulated-trade price lines */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    tradeLineHandlesRef.current.forEach((h) => {
      try {
        series.removePriceLine(h);
      } catch (_) {
        /* noop */
      }
    });
    tradeLineHandlesRef.current = [];

    const makeLine = (price, color, title, style = LineStyle.Solid) => {
      const p = Number(price);
      if (!Number.isFinite(p) || p <= 0) return;
      const h = series.createPriceLine({
        price: p,
        color,
        lineStyle: style,
        lineWidth: 1,
        axisLabelVisible: true,
        title,
      });
      tradeLineHandlesRef.current.push(h);
    };
    makeLine(trade?.entry, '#22c55e', 'Entry');
    makeLine(trade?.exit, '#f59e0b', 'Exit');
    makeLine(trade?.stopLoss, '#ef4444', 'SL', LineStyle.Dashed);
    makeLine(trade?.takeProfit, '#8b5cf6', 'TP', LineStyle.Dashed);
  }, [trade?.entry, trade?.exit, trade?.stopLoss, trade?.takeProfit]);

  /** User drawings (price lines + synthetic vertical segments) */
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return;

    removeAllUserGraphics();

    const colorFor = (kind) => {
      if (kind === 'entry') return '#4ade80';
      if (kind === 'sl') return '#f87171';
      if (kind === 'tp') return '#c084fc';
      return 'rgba(148, 163, 184, 0.85)';
    };

    const styleFor = (kind) => (kind === 'sl' || kind === 'tp' ? LineStyle.Dashed : LineStyle.Solid);

    drawings.forEach((d) => {
      if ((d.kind === 'hline' || d.kind === 'entry' || d.kind === 'sl' || d.kind === 'tp') && Number.isFinite(d.price)) {
        const h = series.createPriceLine({
          price: d.price,
          color: colorFor(d.kind),
          lineStyle: styleFor(d.kind),
          lineWidth: 1,
          axisLabelVisible: true,
          title: d.kind === 'hline' ? 'Draw' : d.kind.toUpperCase(),
        });
        userPriceLineHandlesRef.current.push(h);
      }
    });

    const vlines = drawings.filter((d) => d.kind === 'vline' && Number.isFinite(d.time));
    if (vlines.length && currentBars.length) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const b of currentBars) {
        lo = Math.min(lo, b.low);
        hi = Math.max(hi, b.high);
      }
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        vlines.forEach((d) => {
          const t = d.time;
          const t2 = t + 1;
          const ls = chart.addLineSeries({
            color: 'rgba(56, 189, 248, 0.75)',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            lineStyle: LineStyle.Solid,
          });
          ls.setData([
            { time: t, value: lo },
            { time: t2, value: hi },
          ]);
          userVlineSeriesRef.current.push(ls);
        });
      }
    }
  }, [drawings, currentBars, removeAllUserGraphics]);

  /** Markers (trades + annotations) */
  useEffect(() => {
    if (!candleRef.current) return;
    const markers = [];
    const pushTradeMarker = (t, isExit) => {
      const tsRaw = isExit ? t?.closeTime || t?.exitTime : t?.openTime || t?.entryTime;
      const ts = tsRaw ? Math.floor(new Date(tsRaw).getTime() / 1000) : null;
      if (!Number.isFinite(ts)) return;
      markers.push({
        time: ts,
        position: isExit ? 'aboveBar' : 'belowBar',
        color: isExit ? '#f59e0b' : toMarkerColor(t?.direction || trade?.direction),
        shape: isExit ? 'circle' : 'arrowUp',
        text: isExit ? 'Exit' : `${String(t?.direction || '').toUpperCase()} Entry`,
      });
    };
    if (trade) {
      pushTradeMarker(trade, false);
      pushTradeMarker(trade, true);
    }
    for (const t of openTrades) pushTradeMarker(t, false);
    for (const t of closedTrades) {
      pushTradeMarker(t, false);
      pushTradeMarker(t, true);
    }
    for (const a of annotations) {
      const ts = Number(a?.time);
      if (!Number.isFinite(ts)) continue;
      markers.push({
        time: ts,
        position: a?.position === 'aboveBar' ? 'aboveBar' : 'belowBar',
        color: String(a?.color || '#38bdf8'),
        shape: a?.shape || 'square',
        text: String(a?.text || 'Note').slice(0, 18),
      });
    }
    candleRef.current.setMarkers(markers);
  }, [annotations, closedTrades, openTrades, trade]);

  const requestFit = useCallback(() => {
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series || !currentBars.length) return;
    try {
      chart.timeScale().fitContent();
      hasFittedOnceRef.current = true;
    } catch (_) {
      /* noop */
    }
  }, [currentBars.length]);

  return (
    <div>
      <div className="bt-replay-chart-tools" role="toolbar" aria-label="Chart drawing tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bt-replay-chart-tool${activeTool === t.id ? ' bt-replay-chart-tool--active' : ''}`}
            title={t.title}
            onClick={() => setActiveTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="bt-replay-chart-tool" title="Clear user drawings" onClick={clearDrawings}>
          Clear
        </button>
        <button type="button" className="bt-replay-chart-tool" title="Fit visible range to data" onClick={requestFit}>
          Fit view
        </button>
      </div>
      <div
        ref={wrapRef}
        data-testid="replay-chart-mount"
        style={{ width: '100%', height: 420, borderRadius: 10, overflow: 'hidden' }}
      />
      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
        Candle {Math.max(0, currentIndex + 1)} / {bars?.length || 0} · zoom and pan preserve during replay
      </div>
    </div>
  );
}
