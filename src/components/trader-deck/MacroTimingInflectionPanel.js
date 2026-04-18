import React from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

function BulletList({ items }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <ul className="mo-macro-timing__bullets">
      {list.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const m = model && typeof model === 'object' ? model : {};
  const tl = m.timingLayers && typeof m.timingLayers === 'object' ? m.timingLayers : {};
  const inf = m.inflection && typeof m.inflection === 'object' ? m.inflection : { level: 'MEDIUM', drivers: [], whatChanges: [] };
  const catalysts = Array.isArray(m.catalystEntries) ? m.catalystEntries : [];
  const fp = m.flowPositioning && typeof m.flowPositioning === 'object' ? m.flowPositioning : {};
  const vs = m.volatilityStructure && typeof m.volatilityStructure === 'object' ? m.volatilityStructure : {};
  const sc = m.scenarios && typeof m.scenarios === 'object' ? m.scenarios : {};
  const edge = m.traderEdge && typeof m.traderEdge === 'object' ? m.traderEdge : {};

  const level = String(inf.level || 'MEDIUM').toUpperCase();
  const inflectionCls =
    level === 'HIGH'
      ? 'mo-macro-timing__pill mo-macro-timing__pill--high'
      : level === 'LOW'
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
        <span className="mo-meta mo-macro-timing__fresh" title={updatedAt || ''}>
          {formatRelativeFreshness(updatedAt) || '—'}
        </span>
      </header>
      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing">
        <div className="mo-macro-timing__stack">
          <div className="mo-macro-timing__block mo-macro-timing__block--timing-expanded">
            <p className="mo-macro-timing__k">Active timing window</p>
            <div className="mo-macro-timing__layer">
              <span className="mo-macro-timing__layer-tag">Phase</span>
              <div className="mo-macro-timing__layer-body">
                <strong className="mo-macro-timing__phase-title">{tl.phaseLabel || 'Expansion'}</strong>
                <p className="mo-macro-timing__layer-line">
                  Macro phase sets risk clocks — stack trades with session liquidity, not narratives alone.
                </p>
              </div>
            </div>
            <div className="mo-macro-timing__layer">
              <span className="mo-macro-timing__layer-tag">Intraday · 0–6h</span>
              <div className="mo-macro-timing__layer-body">
                {(tl.intraday || []).map((line, i) => (
                  <p key={i} className="mo-macro-timing__layer-line">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="mo-macro-timing__layer">
              <span className="mo-macro-timing__layer-tag">Session · 6–24h</span>
              <div className="mo-macro-timing__layer-body">
                {(tl.sessionHorizon || []).map((line, i) => (
                  <p key={i} className="mo-macro-timing__layer-line">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="mo-macro-timing__layer">
              <span className="mo-macro-timing__layer-tag">Swing · 1–3d</span>
              <div className="mo-macro-timing__layer-body">
                {(tl.swing || []).map((line, i) => (
                  <p key={i} className="mo-macro-timing__layer-line">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--inflection-rich">
            <div className="mo-macro-timing__inflection-head">
              <p className="mo-macro-timing__k">Inflection risk</p>
              <div className="mo-macro-timing__level-row">
                <span className="mo-macro-timing__inline-k">Level</span>
                <span className={inflectionCls}>{level}</span>
              </div>
            </div>
            <p className="mo-macro-timing__label-row">
              <span className="mo-macro-timing__inline-k">Drivers</span>
            </p>
            <BulletList items={inf.drivers} />
            <p className="mo-macro-timing__label-row mo-macro-timing__label-row--spaced">
              <span className="mo-macro-timing__inline-k">What changes this</span>
            </p>
            <BulletList items={inf.whatChanges} />
          </div>

          <div className="mo-macro-timing__catalyst-scroll">
            <p className="mo-macro-timing__k mo-macro-timing__k--section">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-cards">
              {catalysts.map((c, i) => (
                <li key={i} className="mo-macro-timing__catalyst-card">
                  <header className="mo-macro-timing__catalyst-head">
                    <span className="mo-macro-timing__catalyst-type">{c.type}</span>
                    <span className="mo-macro-timing__catalyst-title">{c.title}</span>
                  </header>
                  <dl className="mo-macro-timing__catalyst-dl">
                    <div className="mo-macro-timing__catalyst-dt-row">
                      <dt>State</dt>
                      <dd>{c.state}</dd>
                    </div>
                    <div className="mo-macro-timing__catalyst-dt-row">
                      <dt>Trigger</dt>
                      <dd>{c.trigger}</dd>
                    </div>
                    <div className="mo-macro-timing__catalyst-dt-row">
                      <dt>Market reaction</dt>
                      <dd>{c.marketReaction}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--flow">
            <p className="mo-macro-timing__k">Flow &amp; positioning</p>
            <dl className="mo-macro-timing__kv">
              <div>
                <dt>Dealer positioning</dt>
                <dd>{fp.dealer}</dd>
              </div>
              <div>
                <dt>Systematic flows</dt>
                <dd>{fp.systematic}</dd>
              </div>
              <div>
                <dt>Position crowding</dt>
                <dd>{fp.crowding}</dd>
              </div>
              <div>
                <dt>Implication</dt>
                <dd>{fp.implication}</dd>
              </div>
            </dl>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--volstruct">
            <p className="mo-macro-timing__k">Volatility structure</p>
            <dl className="mo-macro-timing__kv mo-macro-timing__kv--tight">
              <div>
                <dt>Realized vol</dt>
                <dd>{vs.realized}</dd>
              </div>
              <div>
                <dt>Implied vol</dt>
                <dd>{vs.implied}</dd>
              </div>
              <div>
                <dt>Vol regime</dt>
                <dd>{vs.regime}</dd>
              </div>
              <div>
                <dt>Implication</dt>
                <dd>{vs.implication}</dd>
              </div>
            </dl>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--scenarios">
            <p className="mo-macro-timing__k">Expected market behavior</p>
            <ul className="mo-macro-timing__scenario-lines">
              <li>{sc.baseCase}</li>
              <li>{sc.ifFlowEnters}</li>
              <li>{sc.ifMacroHits}</li>
              <li>{sc.failureMode}</li>
            </ul>
          </div>

          <div className="mo-macro-timing__block mo-macro-timing__block--edge">
            <p className="mo-macro-timing__k">Trader timing edge</p>
            <dl className="mo-macro-timing__edge-grid">
              <div>
                <dt>Primary</dt>
                <dd>{edge.primary}</dd>
              </div>
              <div>
                <dt>Secondary</dt>
                <dd>{edge.secondary}</dd>
              </div>
              <div>
                <dt>Execution</dt>
                <dd>{edge.execution}</dd>
              </div>
              <div>
                <dt>Avoid</dt>
                <dd>{edge.avoid}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
