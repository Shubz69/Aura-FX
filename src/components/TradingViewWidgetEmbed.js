import React, { useEffect, useMemo, useRef, useState } from 'react';

const SCRIPT_ID = 'tradingview-widget-script';

/** Single shared tv.js load — safe for multiple embeds (Backtesting, Trader Replay, etc.). */
export function ensureTradingViewScript() {
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
  fillParent = false,
  theme = 'dark',
  studies = [],
  className = 'trader-suite-chart-frame',
  allowSymbolChange = true,
  onError,
}) {
  const containerRef = useRef(null);
  const outerRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [fillDims, setFillDims] = useState({ w: 0, h: 0 });
  const widgetId = useMemo(
    () =>
      `tradingview-widget-${symbol.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${String(interval)}-${Math.random().toString(36).slice(2, 8)}`,
    [symbol, interval]
  );

  useEffect(() => {
    if (!fillParent || !outerRef.current) return undefined;

    let t;
    const el = outerRef.current;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width));
      const h = Math.max(0, Math.floor(r.height));
      setFillDims((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(apply, 100);
    });
    ro.observe(el);
    apply();

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [fillParent]);

  useEffect(() => {
    let active = true;

    ensureTradingViewScript()
      .then(() => {
        if (!active || !containerRef.current || !window.TradingView?.widget) {
          if (active) onErrorRef.current?.(new Error('TradingView API not available'));
          return;
        }
        if (fillParent && (fillDims.w < 80 || fillDims.h < 80)) {
          return;
        }
        containerRef.current.innerHTML = '';
        try {
          const useMeasured = fillParent && fillDims.w >= 80 && fillDims.h >= 80;
          // Official TradingView embeddable widget. With fillParent we pass explicit px size so the
          // iframe matches the chart host (tv.js autosize alone often stays at a default height).
          // eslint-disable-next-line no-new
          new window.TradingView.widget({
            autosize: !useMeasured,
            ...(useMeasured ? { width: fillDims.w, height: fillDims.h } : {}),
            symbol,
            interval,
            timezone: 'Etc/UTC',
            theme,
            style: '1',
            locale: 'en',
            enable_publishing: false,
            allow_symbol_change: allowSymbolChange,
            hide_top_toolbar: false,
            hide_legend: false,
            withdateranges: true,
            save_image: false,
            studies,
            container_id: widgetId,
          });
        } catch (e) {
          if (active) {
            console.error('TradingView widget failed to construct', e);
            onErrorRef.current?.(e);
          }
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('TradingView widget failed to load', error);
        onErrorRef.current?.(error);
      });

    return () => {
      active = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [allowSymbolChange, fillDims.h, fillDims.w, fillParent, interval, studies, symbol, theme, widgetId]);

  const h = height === '100%' || fillParent ? '100%' : height;
  const minH = fillParent ? '100%' : h === '100%' ? 'min(520px, 52vh)' : height;

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: '100%',
        height: h,
        minHeight: minH,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div
        id={widgetId}
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
