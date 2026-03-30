import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const MODES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'OHLC bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];

export default function MarketDecoderChart({ bars }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const [mode, setMode] = useState('candles');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !bars || bars.length < 2) return undefined;

    const height = Math.min(400, Math.max(260, Math.floor(typeof window !== 'undefined' ? window.innerHeight * 0.28 : 320)));

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e1a' },
        textColor: 'rgba(220, 225, 235, 0.88)',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(212, 175, 55, 0.06)' },
        horzLines: { color: 'rgba(212, 175, 55, 0.06)' },
      },
      timeScale: { borderColor: 'rgba(212,175,55,0.18)' },
      rightPriceScale: { borderColor: 'rgba(212,175,55,0.18)' },
    });
    chartRef.current = chart;

    const data = bars.map((b) => ({
      time: Number(b.time),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
    }));

    const lineData = data.map((b) => ({ time: b.time, value: b.close }));

    if (mode === 'candles') {
      const s = chart.addCandlestickSeries({
        upColor: '#3dd68c',
        downColor: '#ff6b6b',
        borderUpColor: '#3dd68c',
        borderDownColor: '#ff6b6b',
        wickUpColor: '#3dd68c',
        wickDownColor: '#ff6b6b',
      });
      s.setData(data);
    } else if (mode === 'bars') {
      const s = chart.addBarSeries({
        upColor: '#3dd68c',
        downColor: '#ff6b6b',
        thinBars: false,
      });
      s.setData(data);
    } else if (mode === 'line') {
      const s = chart.addLineSeries({ color: '#d4af37', lineWidth: 2 });
      s.setData(lineData);
    } else {
      const s = chart.addAreaSeries({
        lineColor: '#d4af37',
        topColor: 'rgba(212, 175, 55, 0.32)',
        bottomColor: 'rgba(10, 14, 26, 0.02)',
        lineWidth: 2,
      });
      s.setData(lineData);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (wrapRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: wrapRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, mode]);

  if (!bars || bars.length < 2) {
    return (
      <div className="md-chart-empty">
        <p className="md-decoder-small">
          Not enough OHLC history to plot yet — decode again after price feeds return a longer daily series.
        </p>
      </div>
    );
  }

  return (
    <div className="md-chart-root">
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
      <div ref={wrapRef} className="md-chart-canvas-wrap" />
      <p className="md-chart-attrib">
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
          Lightweight Charts
        </a>{' '}
        © TradingView (Apache 2.0)
      </p>
    </div>
  );
}
