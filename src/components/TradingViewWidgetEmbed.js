import React, { useEffect, useMemo, useRef } from 'react';

const SCRIPT_ID = 'tradingview-widget-script';

function ensureTradingViewScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.TradingView && window.TradingView.widget) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

export default function TradingViewWidgetEmbed({
  symbol = 'OANDA:EURUSD',
  interval = '60',
  height = 440,
  theme = 'dark',
  studies = [],
}) {
  const containerRef = useRef(null);
  const widgetId = useMemo(
    () => `tradingview-widget-${symbol.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
    [symbol]
  );

  useEffect(() => {
    let active = true;

    ensureTradingViewScript()
      .then(() => {
        if (!active || !containerRef.current || !window.TradingView?.widget) return;
        containerRef.current.innerHTML = '';
        // Official TradingView embeddable widget. This does not require the paid Charting Library.
        // It gives us a polished live chart while app-driven replay insights remain in Aura UI.
        // eslint-disable-next-line no-new
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone: 'Etc/UTC',
          theme,
          style: '1',
          locale: 'en',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_legend: false,
          withdateranges: true,
          save_image: false,
          studies,
          container_id: widgetId,
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error('TradingView widget failed to load', error);
      });

    return () => {
      active = false;
    };
  }, [interval, studies, symbol, theme, widgetId]);

  return (
    <div className="trader-suite-chart-frame" style={{ minHeight: height }}>
      <div id={widgetId} ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
