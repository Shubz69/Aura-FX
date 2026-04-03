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
        background: { type: ColorType.Solid, color: '#07111f' },
        textColor: 'rgba(220, 225, 235, 0.88)',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(140, 175, 255, 0.08)' },
        horzLines: { color: 'rgba(140, 175, 255, 0.08)' },
      },
      timeScale: { borderColor: 'rgba(140,175,255,0.2)' },
      rightPriceScale: { borderColor: 'rgba(140,175,255,0.2)' },
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
        upColor: '#56e3a7',
        downColor: '#ff7e91',
        borderUpColor: '#56e3a7',
        borderDownColor: '#ff7e91',
        wickUpColor: '#56e3a7',
        wickDownColor: '#ff7e91',
      });
      s.setData(data);
    } else if (mode === 'bars') {
      const s = chart.addBarSeries({
        upColor: '#56e3a7',
        downColor: '#ff7e91',
        thinBars: false,
      });
      s.setData(data);
    } else if (mode === 'line') {
      const s = chart.addLineSeries({ color: '#8cafff', lineWidth: 2 });
      s.setData(lineData);
    } else {
      const s = chart.addAreaSeries({
        lineColor: '#8cafff',
        topColor: 'rgba(140, 175, 255, 0.28)',
        bottomColor: 'rgba(7, 17, 31, 0.04)',
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
          Not enough OHLC history to plot yet — run Decode again once more daily bars are available for this symbol.
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
