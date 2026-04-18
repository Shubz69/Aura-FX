import React, { useEffect, useRef, useState } from 'react';
import {
  ensureTradingViewChartingLibraryLoaded,
  normalizeChartingLibraryInterval,
} from '../utils/tradingViewChartingLibraryLoader';

const PUBLIC = process.env.PUBLIC_URL || '';

const DEFAULT_DATAFEED = 'https://demo_feed.tradingview.com';

/**
 * Full TradingView Charting Library (self-hosted), same pattern as
 * charting-library-examples/react-javascript — not the free tv.js widget.
 *
 * Requires under `public/`:
 *   - charting_library/   (from TradingView charting_library repo)
 *   - datafeeds/          (UDF bundle at datafeeds/udf/dist/bundle.js)
 */
export default function TradingViewChartingLibrary({
  symbol = 'AAPL',
  interval = 'D',
  datafeedUrl = DEFAULT_DATAFEED,
  libraryPath = `${PUBLIC}/charting_library/`,
  height = 430,
  fillParent = false,
  className = '',
  theme = 'dark',
}) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    ensureTradingViewChartingLibraryLoaded(PUBLIC)
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const feedBase = String(datafeedUrl || '').replace(/\/+$/, '');
        const datafeed = new window.Datafeeds.UDFCompatibleDatafeed(feedBase, undefined, {
          maxResponseLength: 1000,
          expectedOrder: 'latestFirst',
        });

        const normalizedLibraryPath = libraryPath.endsWith('/') ? libraryPath : `${libraryPath}/`;

        // eslint-disable-next-line new-cap
        const tvWidget = new window.TradingView.widget({
          symbol,
          datafeed,
          interval,
          container: containerRef.current,
          library_path: normalizedLibraryPath,
          locale: 'en',
          disabled_features: ['use_localstorage_for_settings'],
          enabled_features: ['study_templates'],
          fullscreen: false,
          autosize: true,
          theme,
          overrides: theme === 'dark' ? { 'paneProperties.background': '#0a0a0f' } : {},
        });

        widgetRef.current = tvWidget;
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setError(e?.message || 'Charting Library failed to load');
        }
      });

    return () => {
      cancelled = true;
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch (_) {
          /* ignore */
        }
        widgetRef.current = null;
      }
    };
  }, [symbol, interval, datafeedUrl, libraryPath, theme, height, fillParent]);

  const boxHeight = height === '100%' || fillParent ? '100%' : height;
  /* fillParent: parent supplies height — use 100% min-height so the widget fills the chart slot */
  const boxMin = fillParent ? '100%' : height === '100%' ? 'min(520px, 52vh)' : height;

  if (error) {
    return (
      <div
        className={className}
        style={{
          minHeight: boxMin,
          height: fillParent ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          textAlign: 'center',
          border: '1px solid rgba(234, 169, 96, 0.25)',
          borderRadius: 12,
          background: 'rgba(6, 5, 12, 0.85)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 14,
        }}
      >
        <strong style={{ marginBottom: 8 }}>Charting Library not available</strong>
        <span style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 520, lineHeight: 1.5 }}>
          Copy <code style={{ color: 'rgba(234,169,96,0.95)' }}>charting_library</code> and{' '}
          <code style={{ color: 'rgba(234,169,96,0.95)' }}>datafeeds</code> from your TradingView library
          download into <code style={{ color: 'rgba(234,169,96,0.95)' }}>public/</code>, or run{' '}
          <code style={{ color: 'rgba(234,169,96,0.95)' }}>scripts/copy-tradingview-charting-library.ps1</code>{' '}
          if you have GitHub access to the private repo. Then refresh the page.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        minHeight: boxMin,
        height: boxHeight,
        width: '100%',
        minWidth: 0,
      }}
    />
  );
}
