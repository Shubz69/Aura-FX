import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';
import {
  auraCandlestickSeriesOptions,
  auraChartVisualOptions,
} from '../../lib/charts/lightweightChartData';
import { formatCandleTooltip } from '../../lib/charts/candleIntelligence';

function toMarkerColor(direction) {
  return direction === 'buy' ? '#10b981' : '#ef4444';
}

export default function TradeReplayChart({
  bars,
  visibleBars,
  trade,
  currentIndex,
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
  const entryLineRef = useRef(null);
  const exitLineRef = useRef(null);
  const slLineRef = useRef(null);
  const tpLineRef = useRef(null);

  const currentBars = useMemo(() => {
    if (!Array.isArray(bars) || !bars.length) return [];
    const cap = Math.max(1, Math.min(bars.length, Number(visibleBars) || bars.length));
    return bars.slice(0, cap);
  }, [bars, visibleBars]);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
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

    const clickHandler = (param) => {
      if (!param?.point) return;
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
      if (!selected) return;
      onSelectCandle?.({
        ...selected,
        symbol,
        interval,
      });
    };
    chart.subscribeClick(clickHandler);
    chart.__replayClick = clickHandler;

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
    chart.__replayHover = hoverHandler;

    const makeLine = (price, color, title, style = LineStyle.Solid) => {
      const p = Number(price);
      if (!Number.isFinite(p) || p <= 0) return null;
      return candleRef.current.createPriceLine({
        price: p,
        color,
        lineStyle: style,
        lineWidth: 1,
        axisLabelVisible: true,
        title,
      });
    };
    entryLineRef.current = makeLine(trade?.entry, '#22c55e', 'Entry');
    exitLineRef.current = makeLine(trade?.exit, '#f59e0b', 'Exit');
    slLineRef.current = makeLine(trade?.stopLoss, '#ef4444', 'SL', LineStyle.Dashed);
    tpLineRef.current = makeLine(trade?.takeProfit, '#8b5cf6', 'TP', LineStyle.Dashed);

    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !wrapRef.current) return;
      chartRef.current.applyOptions({ width: wrapRef.current.clientWidth });
    });
    ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      try {
        if (chart.__replayClick) chart.unsubscribeClick(chart.__replayClick);
        if (chart.__replayHover) chart.unsubscribeCrosshairMove(chart.__replayHover);
      } catch (_) {
        // ignore
      }
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [trade?.entry, trade?.exit, trade?.stopLoss, trade?.takeProfit, symbol, interval, onHoverCandle, onSelectCandle]);

  useEffect(() => {
    if (!candleRef.current) return;
    candleRef.current.setData(currentBars);
    if (!currentBars.length) return;
    const markerColor = toMarkerColor(trade?.direction);
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
  }, [annotations, closedTrades, currentBars, openTrades, trade]);

  useEffect(() => {
    if (!chartRef.current || !currentBars.length) return;
    const ts = Number(recenterTargetTime);
    if (!Number.isFinite(ts)) return;
    const targetIndex = currentBars.findIndex((b) => Number(b.time) >= ts);
    const safeIndex = targetIndex >= 0 ? targetIndex : Math.max(0, currentBars.length - 1);
    const left = 45;
    const right = 45;
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(-5, safeIndex - left),
      to: Math.min(currentBars.length + 5, safeIndex + right),
    });
  }, [recenterKey, recenterTargetTime, currentBars]);

  return (
    <div>
      <div
        ref={wrapRef}
        data-testid="replay-chart-mount"
        style={{ width: '100%', height: 420, borderRadius: 10, overflow: 'hidden' }}
      />
      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
        Candle {Math.max(0, currentIndex + 1)} / {bars?.length || 0} · zoom and pan directly on chart
      </div>
    </div>
  );
}
