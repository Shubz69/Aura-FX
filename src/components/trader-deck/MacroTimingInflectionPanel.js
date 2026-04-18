import React from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

function bucketShort(bucket) {
  const b = String(bucket || '').toLowerCase();
  if (b === 'flow') return 'Flow';
  if (b === 'liquidity') return 'Liquidity';
  return 'Macro';
}

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const m = model && typeof model === 'object' ? model : {};
  const rows = Array.isArray(m.catalystRows) ? m.catalystRows : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior.filter(Boolean) : [];
  const inflection = String(m.inflectionRisk || 'Medium');

  const inflectionCls =
    inflection === 'High'
      ? 'mo-macro-timing__pill mo-macro-timing__pill--high'
      : inflection === 'Low'
        ? 'mo-macro-timing__pill mo-macro-timing__pill--low'
        : 'mo-macro-timing__pill mo-macro-timing__pill--mid';

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell"
      aria-label="Macro timing and inflection window"
    >
      <header className="td-outlook-concept-card__head td-outlook-concept-card__head--macro-timing">
        <h2 className="td-outlook-concept-card__title td-outlook-concept-card__title--macro-timing">
          Macro timing &amp; inflection window
        </h2>
        <span className="mo-meta" title={updatedAt || ''}>
          {formatRelativeFreshness(updatedAt)}
        </span>
      </header>
      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing">
        <div className="mo-macro-timing__stack">
          <div className="mo-macro-timing__block mo-macro-timing__block--timing">
            <p className="mo-macro-timing__k">Active timing window</p>
            <p className="mo-macro-timing__phase">{m.phaseLabel || 'Active'}</p>
            <p className="mo-macro-timing__sub">{m.nextRiskLine || '—'}</p>
            <p className="mo-macro-timing__sub mo-macro-timing__sub--muted">{m.sessionLine || '—'}</p>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--inflection">
            <p className="mo-macro-timing__k">Inflection risk level</p>
            <span className={inflectionCls}>{inflection}</span>
          </div>

          <div className="mo-macro-timing__catalyst-scroll">
            <p className="mo-macro-timing__k mo-macro-timing__k--section">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-list">
              {rows.map((row, i) => (
                <li key={i} className="mo-macro-timing__catalyst-row">
                  <span className="mo-macro-timing__catalyst-bucket">{bucketShort(row.bucket)}</span>
                  <span className="mo-macro-timing__catalyst-text">{row.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--behavior">
            <p className="mo-macro-timing__k">Expected market behavior</p>
            {behavior.map((line, i) => (
              <p key={i} className="mo-macro-timing__line">
                {line}
              </p>
            ))}
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--insight">
            <p className="mo-macro-timing__k">Trader timing insight</p>
            <p className="mo-macro-timing__insight">{m.traderInsight || '—'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
