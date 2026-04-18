import React from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

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
  const catalystLines = Array.isArray(m.catalystLines) ? m.catalystLines : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior : [];
  const matrix = m.tradeConditionsMatrix && typeof m.tradeConditionsMatrix === 'object' ? m.tradeConditionsMatrix : {};
  const edgeLines = Array.isArray(m.traderEdgeLines) ? m.traderEdgeLines : [];

  const lvlMod = levelMod(inflect.level);
  const headline =
    timing.headline ||
    [timing.status, timing.timeToCatalyst, timing.sessionCondition ? `${timing.sessionCondition} session` : null]
      .filter(Boolean)
      .join(' · ');

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
        <div className="mo-macro-timing__stack mo-macro-timing__stack--compact">
          <div className="mo-macro-timing__block mo-macro-timing__block--active-window">
            <p className="mo-macro-timing__k">Active timing window</p>
            <p className="mo-macro-timing__line mo-macro-timing__line--head">{headline || '—'}</p>
            <p className="mo-macro-timing__line mo-macro-timing__line--sub">{timing.executionNote || timing.executionImplication || ''}</p>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--inflection-risk">
            <p className="mo-macro-timing__k">Inflection risk level</p>
            <div className="mo-macro-timing__inflection-inline">
              <span className={`mo-macro-timing__lvl mo-macro-timing__lvl--${lvlMod}`}>{inflect.level || '—'}</span>
              <span className="mo-macro-timing__inflection-reason">{inflect.reason || inflect.explanation || ''}</span>
            </div>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--snapshot">
            <p className="mo-macro-timing__k">Market state snapshot</p>
            <dl className="mo-macro-timing__snapshot-rows mo-macro-timing__snapshot-rows--tight">
              <div className="mo-macro-timing__snapshot-row">
                <dt>Vol</dt>
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

          <div className="mo-macro-timing__block mo-macro-timing__block--catalyst">
            <p className="mo-macro-timing__k">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-lines">
              {catalystLines.slice(0, 5).map((line, i) => (
                <li key={i} className="mo-macro-timing__catalyst-line">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--behavior">
            <p className="mo-macro-timing__k">Expected market behavior</p>
            <ul className="mo-macro-timing__bullet-tight">
              {behavior.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--matrix">
            <p className="mo-macro-timing__k">Trade conditions matrix</p>
            <ul className="mo-macro-timing__matrix-inline">
              <li>
                <span className="mo-macro-timing__matrix-key">Breakout</span>
                <span className="mo-macro-timing__matrix-arrow" aria-hidden>
                  →
                </span>
                <span className="mo-macro-timing__matrix-val">{matrix.breakout || '—'}</span>
              </li>
              <li>
                <span className="mo-macro-timing__matrix-key">Mean reversion</span>
                <span className="mo-macro-timing__matrix-arrow" aria-hidden>
                  →
                </span>
                <span className="mo-macro-timing__matrix-val">{matrix.meanReversion || '—'}</span>
              </li>
              <li>
                <span className="mo-macro-timing__matrix-key">No trade</span>
                <span className="mo-macro-timing__matrix-arrow" aria-hidden>
                  →
                </span>
                <span className="mo-macro-timing__matrix-val">{matrix.noTradeZone || '—'}</span>
              </li>
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--edge">
            <p className="mo-macro-timing__k">Trader timing edge</p>
            <ul className="mo-macro-timing__bullet-tight mo-macro-timing__bullet-tight--edge">
              {edgeLines.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
