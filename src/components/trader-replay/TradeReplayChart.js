import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, LineStyle } from 'lightweight-charts';

function toMarkerColor(direction) {
  return direction === 'buy' ? '#10b981' : '#ef4444';
}

export default function TradeReplayChart({
  bars,
  visibleBars,
  trade,
  currentIndex,
  openTrades = [],
  closedTrades = [],
  annotations = [],
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
      layout: { background: { color: '#0f172a' }, textColor: '#cbd5e1' },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.08)' },
        horzLines: { color: 'rgba(148,163,184,0.08)' },
      },
      rightPriceScale: { borderColor: 'rgba(148,163,184,0.2)' },
      timeScale: { borderColor: 'rgba(148,163,184,0.2)', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: 'rgba(245,158,11,0.5)' }, horzLine: { color: 'rgba(245,158,11,0.5)' } },
    });
    chartRef.current = chart;
    candleRef.current = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      borderVisible: false,
    });

    const makeLine = (price, color, title, style = LineStyle.Solid) => {
      if (!Number.isFinite(Number(price))) return null;
      return candleRef.current.createPriceLine({
        price: Number(price),
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
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, [trade?.entry, trade?.exit, trade?.stopLoss, trade?.takeProfit]);

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
    chartRef.current?.timeScale().fitContent();
  }, [annotations, closedTrades, currentBars, openTrades, trade]);

  return (
    <div>
      <div ref={wrapRef} style={{ width: '100%', height: 420, borderRadius: 10, overflow: 'hidden' }} />
      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
        Candle {Math.max(0, currentIndex + 1)} / {bars?.length || 0} · zoom and pan directly on chart
      </div>
    </div>
  );
}
