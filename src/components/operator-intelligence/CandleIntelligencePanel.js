import React, { useEffect, useRef, useState } from 'react';
import { FaTimes, FaBolt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Api from '../../services/Api';

/**
 * Slide-over intelligence for a clicked candle.
 * @param {{ open: boolean, onClose: () => void, bar: object | null, symbol: string }} props
 */
export default function CandleIntelligencePanel({ open, onClose, bar, symbol, interval }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: false, error: '', payload: null });
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open || !bar?.time || !symbol) {
      setState({ loading: false, error: '', payload: null });
      return undefined;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setState({ loading: true, error: '', payload: null });
    const controller = new AbortController();
    abortRef.current = controller;
    timerRef.current = setTimeout(() => {
      Api.getMarketCandleContext(symbol, {
        interval,
        candleTime: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        signal: controller.signal,
      })
        .then((res) => {
          setState({
            loading: false,
            error: '',
            payload: res?.data?.success ? res.data : null,
          });
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
          setState({
            loading: false,
            error: err?.response?.data?.message || err?.message || 'Failed to load candle context',
            payload: null,
          });
        });
    }, 220);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [open, bar?.time, bar?.open, bar?.high, bar?.low, bar?.close, bar?.volume, symbol, interval]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="oi-drawer__backdrop" aria-label={t('operatorIntelligence.candlePanel.closePanel')} onClick={onClose} />
      <aside className="oi-drawer" role="dialog" aria-modal="true" aria-labelledby="oi-candle-intel-title">
        <header className="oi-drawer__head">
          <div className="oi-drawer__title-row">
            <FaBolt className="oi-drawer__icon" aria-hidden />
            <h2 id="oi-candle-intel-title">{t('operatorIntelligence.candlePanel.title')}</h2>
          </div>
          <button type="button" className="oi-drawer__close" onClick={onClose} aria-label={t('common.close')}>
            <FaTimes />
          </button>
        </header>
        {!bar ? (
          <p className="oi-drawer__muted">{t('operatorIntelligence.candlePanel.noBarSelected')}</p>
        ) : state.loading ? (
          <p className="oi-drawer__muted">{t('operatorIntelligence.candlePanel.resolving')}</p>
        ) : state.error ? (
          <p className="oi-drawer__muted">{state.error}</p>
        ) : (
          <div className="oi-drawer__body">
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.whenDirection')}</h3>
              <p><strong>{state.payload?.candleTime || '—'}</strong> — {symbol} / {interval}</p>
              <p>
                O {state.payload?.ohlc?.open ?? '—'} H {state.payload?.ohlc?.high ?? '—'} L {state.payload?.ohlc?.low ?? '—'} C {state.payload?.ohlc?.close ?? '—'}
              </p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.likelyDriver')}</h3>
              <p>{state.payload?.catalystSummary || 'No major catalyst found'}</p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.relatedContext')}</h3>
              <ul>
                {(state.payload?.events || []).map((ev, idx) => (
                  <li key={`${ev.title}-${idx}`}>{ev.time ? `${ev.time} — ` : ''}{ev.title} ({ev.impact})</li>
                ))}
                {(state.payload?.events || []).length === 0 ? <li>No major catalyst found</li> : null}
              </ul>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.volumeVolatility')}</h3>
              <p>
                Body {state.payload?.body ?? '—'} | Range {state.payload?.range ?? '—'} | Upper wick {state.payload?.upperWick ?? '—'} | Lower wick {state.payload?.lowerWick ?? '—'}
                {state.payload?.ohlc?.volume != null ? ` | Volume ${state.payload.ohlc.volume}` : ''}
              </p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.dxyYieldsRisk')}</h3>
              <p>{state.payload?.macroSentiment?.summary || 'No major catalyst found'}</p>
            </section>
            <section className="oi-intel-block">
              <h3>{t('operatorIntelligence.candlePanel.whatItMeans')}</h3>
              <p>Session: {state.payload?.sessionLabel || '—'} | Market sentiment: {state.payload?.macroSentiment?.marketSentiment || 'Neutral'} | Instrument sentiment: {state.payload?.macroSentiment?.instrumentSentiment || 'Neutral'}</p>
            </section>
            <section className="oi-intel-block oi-intel-block--accent">
              <h3>{t('operatorIntelligence.candlePanel.practicalGuidance')}</h3>
              <p>{(state.payload?.headlines || []).length > 0 ? state.payload.headlines[0].headline : 'No major catalyst found'}</p>
            </section>
            {(state.payload?.headlines || []).length > 0 ? (
              <section className="oi-intel-block oi-intel-block--quote">
                <h3>{t('operatorIntelligence.candlePanel.exampleNarrative')}</h3>
                <ul>
                  {state.payload.headlines.slice(0, 4).map((h, idx) => (
                    <li key={`${h.headline}-${idx}`}>
                      {h.publishedAt ? `${h.publishedAt} — ` : ''}
                      {h.headline}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
