import React, { useMemo } from 'react';
import { FaTimes, FaBolt } from 'react-icons/fa';
import { resolveCandleIntelligence } from '../../services/operatorIntelligenceAdapter';

/**
 * Slide-over intelligence for a clicked candle.
 * @param {{ open: boolean, onClose: () => void, bar: object | null, symbol: string }} props
 */
export default function CandleIntelligencePanel({ open, onClose, bar, symbol }) {
  const intel = useMemo(() => {
    if (!open || !bar || !bar.time) return null;
    return resolveCandleIntelligence(bar, { symbol });
  }, [open, bar, symbol]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="oi-drawer__backdrop" aria-label="Close panel" onClick={onClose} />
      <aside className="oi-drawer" role="dialog" aria-modal="true" aria-labelledby="oi-candle-intel-title">
        <header className="oi-drawer__head">
          <div className="oi-drawer__title-row">
            <FaBolt className="oi-drawer__icon" aria-hidden />
            <h2 id="oi-candle-intel-title">Candle intelligence</h2>
          </div>
          <button type="button" className="oi-drawer__close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </header>
        {!bar ? (
          <p className="oi-drawer__muted">No bar selected.</p>
        ) : !intel ? (
          <p className="oi-drawer__muted">Resolving…</p>
        ) : (
          <div className="oi-drawer__body">
            <section className="oi-intel-block">
              <h3>When & direction</h3>
              <p>
                <strong>{intel.candleTime}</strong> — {intel.direction} bar ({intel.sizeLabel}, body/range ~{intel.bodyRangePct}%).
              </p>
            </section>
            <section className="oi-intel-block">
              <h3>Likely driver</h3>
              <p>{intel.likelyDriver}</p>
            </section>
            <section className="oi-intel-block">
              <h3>Related context</h3>
              <ul>
                {(intel.relatedEvents || []).map((ev) => (
                  <li key={ev}>{ev}</li>
                ))}
              </ul>
            </section>
            <section className="oi-intel-block">
              <h3>Volume / volatility</h3>
              <p>{intel.volumeVolatilityRead}</p>
            </section>
            <section className="oi-intel-block">
              <h3>DXY / yields / risk</h3>
              <p>{intel.correlationRead}</p>
            </section>
            <section className="oi-intel-block">
              <h3>What it means</h3>
              <p>{intel.whatItMeans}</p>
            </section>
            <section className="oi-intel-block oi-intel-block--accent">
              <h3>Practical guidance</h3>
              <p>{intel.practicalGuidance}</p>
            </section>
            {intel.exampleBlurb ? (
              <section className="oi-intel-block oi-intel-block--quote">
                <h3>Example narrative</h3>
                <p>{intel.exampleBlurb}</p>
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}
