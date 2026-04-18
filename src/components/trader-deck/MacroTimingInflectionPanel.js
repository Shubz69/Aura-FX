import React from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const m = model && typeof model === 'object' ? model : {};
  const timing = m.timingCompact?.lines || [];
  const catalystLines = Array.isArray(m.catalystLines) ? m.catalystLines : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior : [];
  const edgeLines = Array.isArray(m.traderEdgeLines) ? m.traderEdgeLines : [];

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell"
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
      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing">
        <div className="mo-macro-timing__stack mo-macro-timing__stack--compact">
          <div className="mo-macro-timing__block mo-macro-timing__block--timing-compact">
            <p className="mo-macro-timing__k">Active timing window</p>
            {timing.slice(0, 2).map((line, i) => (
              <p key={i} className="mo-macro-timing__compact-line">
                {line}
              </p>
            ))}
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--inflection-one">
            <p className="mo-macro-timing__k">Inflection risk</p>
            <p className="mo-macro-timing__inflection-one-line">{m.inflectionSummary || ''}</p>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--catalyst-compact">
            <p className="mo-macro-timing__k">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-dense">
              {catalystLines.map((line, i) => (
                <li key={i} className="mo-macro-timing__catalyst-dense-row">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--behavior-compact">
            <p className="mo-macro-timing__k">Expected market behavior</p>
            <ul className="mo-macro-timing__dense-list">
              {behavior.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--edge-compact">
            <p className="mo-macro-timing__k">Trader timing edge</p>
            <ul className="mo-macro-timing__dense-list mo-macro-timing__dense-list--edge">
              {edgeLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
