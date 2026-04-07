import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const MODES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'OHLC bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];

const TIMEFRAMES_REF = ['1H', '4H', '1D', '1W', '1M'];

/** Approximate zoom on daily OHLC bars (tabs = visible window from the right). */
const TF_VISIBLE_BARS = { '1H': 8, '4H': 16, '1D': 32, '1W': 72, '1M': 400 };

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

export default function MarketDecoderChart({ bars, compact = false, referenceStyle = false }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const [mode, setMode] = useState('candles');
  const [activeTf, setActiveTf] = useState('1D');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !bars || bars.length < 2) return undefined;

    const baseH =
      typeof window !== 'undefined'
        ? window.innerHeight * (referenceStyle ? 0.17 : compact ? 0.2 : 0.28)
        : referenceStyle
          ? 260
          : compact
            ? 220
            : 320;
    const height = Math.min(
      referenceStyle ? 300 : compact ? 260 : 400,
      Math.max(referenceStyle ? 210 : compact ? 180 : 260, Math.floor(baseH))
    );

    const bg = referenceStyle ? '#0b0e14' : '#07111f';
    const gridGold = referenceStyle ? 'rgba(212, 175, 55, 0.07)' : 'rgba(140, 175, 255, 0.08)';

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: referenceStyle ? 'rgba(230, 220, 200, 0.88)' : 'rgba(220, 225, 235, 0.88)',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: gridGold },
        horzLines: { color: gridGold },
      },
      timeScale: { borderColor: referenceStyle ? 'rgba(212,175,55,0.15)' : 'rgba(140,175,255,0.2)' },
      rightPriceScale: { borderColor: referenceStyle ? 'rgba(212,175,55,0.15)' : 'rgba(140,175,255,0.2)' },
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

    if (referenceStyle) {
      const s = chart.addCandlestickSeries({
        upColor: '#3dd68c',
        downColor: '#ff6b81',
        borderUpColor: '#3dd68c',
        borderDownColor: '#ff6b81',
        wickUpColor: '#3dd68c',
        wickDownColor: '#ff6b81',
      });
      s.setData(data);
      if (data.length >= 5) {
        const ma = smaFromCandles(data, Math.min(21, Math.max(5, Math.floor(data.length / 4))));
        if (ma.length) {
          const maSeries = chart.addLineSeries({
            color: '#d4af37',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
          });
          maSeries.setData(ma);
        }
      }
    } else if (mode === 'candles') {
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

    if (referenceStyle && data.length > 0) {
      const zoomBars = TF_VISIBLE_BARS[activeTf] ?? 32;
      const right = data.length - 1;
      const from = Math.max(0, right - zoomBars + 1);
      try {
        chart.timeScale().setVisibleLogicalRange({ from, to: right });
      } catch {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }

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
  }, [bars, mode, compact, referenceStyle, activeTf]);

  if (!bars || bars.length < 2) {
    return (
      <div className={`md-chart-empty${referenceStyle ? ' md-chart-empty--ref' : ''}`}>
        <p className="md-decoder-small">
          Chart history is still loading for this symbol. The rest of the brief is valid; rerun Decode shortly for full OHLC view.
        </p>
      </div>
    );
  }

  return (
    <div className={`md-chart-root${referenceStyle ? ' md-chart-root--ref' : ''}`}>
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
