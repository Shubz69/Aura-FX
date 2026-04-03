import React, { useEffect, useState } from 'react';
import TradingViewWidgetEmbed from './TradingViewWidgetEmbed';
import TradingViewChartingLibrary from './TradingViewChartingLibrary';
import { ensureTradingViewChartingLibraryLoaded } from '../utils/tradingViewChartingLibraryLoader';

const PUBLIC = process.env.PUBLIC_URL || '';

/**
 * Prefer self-hosted Charting Library when present under public/;
 * otherwise use the free TradingView embed (tv.js).
 */
export default function TradingViewChartPanel({
  symbol,
  interval,
  studies = [],
  height = 430,
  className = 'trader-suite-chart-frame',
}) {
  const [engine, setEngine] = useState('checking'); // checking | cl | widget

  useEffect(() => {
    let active = true;
    ensureTradingViewChartingLibraryLoaded(PUBLIC)
      .then(() => {
        if (active) setEngine('cl');
      })
      .catch(() => {
        if (active) setEngine('widget');
      });
    return () => {
      active = false;
    };
  }, []);

  if (engine === 'checking') {
    return (
      <div
        className={className}
        style={{
          minHeight: height,
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

  if (engine === 'cl') {
    return (
      <TradingViewChartingLibrary
        symbol={symbol}
        interval={String(interval)}
        height={height}
        className={className}
        theme="dark"
      />
    );
  }

  return (
    <TradingViewWidgetEmbed
      symbol={symbol}
      interval={interval}
      studies={studies}
      height={height}
      className={className}
    />
  );
}
