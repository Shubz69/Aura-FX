import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

const CATALYST_ITEM_MIN_PX = 46;
const CATALYST_LABEL_EXTRA = 20;

function levelMod(level) {
  const L = String(level || '').toUpperCase();
  if (L === 'HIGH') return 'high';
  if (L === 'LOW') return 'low';
  return 'medium';
}

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const m = model && typeof model === 'object' ? model : {};
  const timing = m.activeTimingWindow && typeof m.activeTimingWindow === 'object' ? m.activeTimingWindow : {};
  const inflect = m.inflectionRisk && typeof m.inflectionRisk === 'object' ? m.inflectionRisk : {};
  const snap = m.marketStateSnapshot && typeof m.marketStateSnapshot === 'object' ? m.marketStateSnapshot : {};
  const catalystItems = Array.isArray(m.catalystItems) ? m.catalystItems : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior : [];
  const matrix = m.tradeConditionsMatrix && typeof m.tradeConditionsMatrix === 'object' ? m.tradeConditionsMatrix : {};
  const edgeLines = Array.isArray(m.traderEdgeLines) ? m.traderEdgeLines : [];

  const middleRef = useRef(null);
  const [catalystN, setCatalystN] = useState(8);

  useLayoutEffect(() => {
    const middle = middleRef.current;
    if (!middle) return;
    const measure = () => {
      const label = middle.querySelector('.mo-macro-timing__k');
      const titleH = (label ? label.offsetHeight : 18) + CATALYST_LABEL_EXTRA;
      const usable = Math.max(0, middle.clientHeight - titleH);
      const n = Math.max(4, Math.min(8, Math.floor(usable / CATALYST_ITEM_MIN_PX)));
      setCatalystN(Number.isFinite(n) ? n : 6);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(middle);
    measure();
    return () => ro.disconnect();
  }, []);

  const visibleCatalyst = catalystItems.slice(0, catalystN);
  const lvlMod = levelMod(inflect.level);

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell mo-macro-timing--stretch"
      aria-label="Macro timing and inflection window"
    >
      <header className="td-outlook-concept-card__head td-outlook-concept-card__head--macro-timing">
        <h2 className="td-outlook-concept-card__title td-outlook-concept-card__title--macro-timing">
          Macro timing &amp; inflection window
        </h2>
        <span className="mo-meta mo-macro-timing__fresh" title={updatedAt || ''}>
          {formatRelativeFreshness(updatedAt) || '—'}
        </span>
      </header>
      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing mo-macro-timing__body-fill">
        <div className="mo-macro-timing__stack mo-macro-timing__stack--fill">
          <div className="mo-macro-timing__region mo-macro-timing__region--fixed-top">
            <div className="mo-macro-timing__block mo-macro-timing__block--active-window">
              <p className="mo-macro-timing__k">Active timing window</p>
              <div className="mo-macro-timing__timing-row mo-macro-timing__timing-row--split">
                <span className="mo-macro-timing__timing-pill">{timing.status || '—'}</span>
                <span className="mo-macro-timing__timing-mid" aria-hidden>
                  ·
                </span>
                <span className="mo-macro-timing__session-cond">{timing.sessionCondition || '—'} session</span>
              </div>
              <p className="mo-macro-timing__timing-line">{timing.timeToCatalyst || '—'}</p>
              <p className="mo-macro-timing__timing-exec">{timing.executionImplication || ''}</p>
            </div>

            <div className="mo-macro-timing__block mo-macro-timing__block--inflection-risk">
              <p className="mo-macro-timing__k">Inflection risk level</p>
              <div className="mo-macro-timing__inflection-row">
                <span className={`mo-macro-timing__lvl mo-macro-timing__lvl--${lvlMod}`}>
                  {inflect.level || '—'}
                </span>
                <p className="mo-macro-timing__inflection-why">{inflect.explanation || ''}</p>
              </div>
            </div>

            <div className="mo-macro-timing__block mo-macro-timing__block--snapshot">
              <p className="mo-macro-timing__k">Market state snapshot</p>
              <dl className="mo-macro-timing__snapshot-rows">
                <div className="mo-macro-timing__snapshot-row">
                  <dt>Vol regime</dt>
                  <dd>{snap.volRegime || '—'}</dd>
                </div>
                <div className="mo-macro-timing__snapshot-row">
                  <dt>Liquidity</dt>
                  <dd>{snap.liquidity || '—'}</dd>
                </div>
                <div className="mo-macro-timing__snapshot-row">
                  <dt>Correlation</dt>
                  <dd>{snap.correlation || '—'}</dd>
                </div>
                <div className="mo-macro-timing__snapshot-row">
                  <dt>Positioning</dt>
                  <dd>{snap.positioning || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mo-macro-timing__grow-wrap">
            <div
              ref={middleRef}
              className="mo-macro-timing__region mo-macro-timing__region--middle mo-macro-timing__region--catalyst"
            >
              <p className="mo-macro-timing__k">Catalyst map</p>
              <ul className="mo-macro-timing__catalyst-items mo-macro-timing__catalyst-items--fill">
                {visibleCatalyst.map((it, i) => (
                  <li key={`${it.tag}-${i}`} className="mo-macro-timing__catalyst-item">
                    <div className="mo-macro-timing__catalyst-title-row">
                      <span className="mo-macro-timing__catalyst-tag">{it.tag}</span>
                      <span className="mo-macro-timing__catalyst-name">{it.title}</span>
                    </div>
                    <div className="mo-macro-timing__catalyst-kv">
                      <span className="mo-macro-timing__catalyst-k">State</span>
                      <span className="mo-macro-timing__catalyst-v">{it.state}</span>
                    </div>
                    <div className="mo-macro-timing__catalyst-kv">
                      <span className="mo-macro-timing__catalyst-k">Trigger</span>
                      <span className="mo-macro-timing__catalyst-v">{it.trigger}</span>
                    </div>
                    <div className="mo-macro-timing__catalyst-kv">
                      <span className="mo-macro-timing__catalyst-k">Reaction</span>
                      <span className="mo-macro-timing__catalyst-v">{it.reaction}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mo-macro-timing__footer-stack">
              <div className="mo-macro-timing__block mo-macro-timing__block--behavior">
                <p className="mo-macro-timing__k">Expected market behavior</p>
                <ul className="mo-macro-timing__bullet-terse">
                  {behavior.slice(0, 4).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="mo-macro-timing__block mo-macro-timing__block--matrix">
                <p className="mo-macro-timing__k">Trade conditions matrix</p>
                <div className="mo-macro-timing__matrix-rows">
                  <div className="mo-macro-timing__matrix-row">
                    <span className="mo-macro-timing__matrix-label">Breakout conditions</span>
                    <p className="mo-macro-timing__matrix-text">{matrix.breakout || '—'}</p>
                  </div>
                  <div className="mo-macro-timing__matrix-row">
                    <span className="mo-macro-timing__matrix-label">Mean reversion conditions</span>
                    <p className="mo-macro-timing__matrix-text">{matrix.meanReversion || '—'}</p>
                  </div>
                  <div className="mo-macro-timing__matrix-row">
                    <span className="mo-macro-timing__matrix-label">No trade zone</span>
                    <p className="mo-macro-timing__matrix-text">{matrix.noTradeZone || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="mo-macro-timing__block mo-macro-timing__block--edge mo-macro-timing__block--edge-anchor">
                <p className="mo-macro-timing__k">Trader timing edge</p>
                <ul className="mo-macro-timing__bullet-terse mo-macro-timing__bullet-terse--edge">
                  {edgeLines.slice(0, 3).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
