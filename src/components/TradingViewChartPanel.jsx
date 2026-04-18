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
  /** When true, height fills the flex parent; parent must set min-height */
  fillParent = false,
  className = 'trader-suite-chart-frame',
  suppressLoadingText = false,
}) {
  const [engine, setEngine] = useState('checking'); // checking | cl | widget
  const resolvedHeight = fillParent ? '100%' : height;
  /** Reserve slot height while chart engine resolves — avoids collapsed black strip with fillParent */
  const loadingMinH = fillParent ? 'clamp(580px, 68vh, 920px)' : height;

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
          minHeight: loadingMinH,
          height: fillParent ? '100%' : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 14,
        }}
      >
        {suppressLoadingText ? '' : 'Loading chart…'}
      </div>
    );
  }

  if (engine === 'cl') {
    return (
      <TradingViewChartingLibrary
        symbol={symbol}
        interval={String(interval)}
        height={resolvedHeight}
        fillParent={fillParent}
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
      height={resolvedHeight}
      fillParent={fillParent}
      className={className}
    />
  );
}
