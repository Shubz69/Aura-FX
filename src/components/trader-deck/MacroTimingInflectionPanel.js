import React, { useMemo } from 'react';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

function levelMod(level) {
  const L = String(level || '').toUpperCase();
  if (L === 'HIGH') return 'high';
  if (L === 'LOW') return 'low';
  return 'medium';
}

/** Parse `[TAG] insight` catalyst lines into badge + body */
function parseCatalystRow(line) {
  const m = String(line || '').match(/^\[([^\]]+)\]\s*(.+)$/);
  return m ? { tag: m[1].trim(), insight: m[2].trim() } : { tag: '—', insight: String(line || '—').trim() };
}

/** Strip verbose prefixes from expected-behavior bullets for scanning */
function stripExpectedPrefix(line) {
  return String(line || '')
    .replace(/^Base case:\s*/i, '')
    .replace(/^Base:\s*/i, '')
    .replace(/^Conditional:\s*/i, '')
    .replace(/^Failure case:\s*/i, '')
    .replace(/^Failure:\s*/i, '')
    .trim();
}

function badgeLevel(level) {
  const L = String(level || '').toUpperCase();
  if (L === 'MEDIUM') return 'MED';
  return L || '—';
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
  const executionContext = Array.isArray(m.executionContext) ? m.executionContext : [];

  const lvlMod = levelMod(inflect.level);

  const catalystParsed = useMemo(() => catalystLines.slice(0, 5).map(parseCatalystRow), [catalystLines]);

  const timingStatus = timing.status || '—';
  const catalystClock =
    timing.timeToCatalyst ||
    (timing.headline ? timing.headline.split(' · ')[1] : null) ||
    '—';

  const timingSubline = [catalystClock, timing.executionNote || timing.executionImplication].filter(Boolean).join(' · ');

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell mo-macro-timing--stretch"
      aria-label="Macro timing and inflection window"
    >
      <header className="mo-macro-timing__header-row td-outlook-concept-card__head td-outlook-concept-card__head--macro-timing">
        <h2 className="mo-macro-timing__title-main td-outlook-concept-card__title td-outlook-concept-card__title--macro-timing">
          Macro timing &amp; inflection window
        </h2>
        <span className="mo-macro-timing__updated" title={updatedAt || ''}>
          Updated {formatRelativeFreshness(updatedAt) || '—'}
        </span>
      </header>

      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing mo-macro-timing__body-fill">
        <div className="mo-macro-timing__stack mo-macro-timing__stack--terminal">
          {/* TOP STRIP — 3 blocks */}
          <div className="mo-macro-timing__top-strip">
            <div className="mo-macro-timing__micro mo-macro-timing__micro--timing">
              <span className="mo-macro-timing__micro-label">Active window</span>
              <strong className="mo-macro-timing__micro-value">{timingStatus}</strong>
              <span className="mo-macro-timing__micro-sub">{timingSubline || '—'}</span>
            </div>

            <div className="mo-macro-timing__micro mo-macro-timing__micro--inflect">
              <span className="mo-macro-timing__micro-label">Inflection</span>
              <span className={`mo-macro-timing__risk-badge mo-macro-timing__risk-badge--${lvlMod}`}>
                {badgeLevel(inflect.level)}
              </span>
              <span className="mo-macro-timing__micro-sub">{inflect.reason || inflect.explanation || ''}</span>
            </div>

            <div className="mo-macro-timing__micro mo-macro-timing__micro--state">
              <span className="mo-macro-timing__micro-label">Market state</span>
              <div className="mo-macro-timing__state-mini">
                <span className="mo-macro-timing__state-item">
                  <abbr title="Volatility regime">Vol</abbr>
                  <strong>{snap.volRegime || '—'}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title="Liquidity">Liq</abbr>
                  <strong>{snap.liquidity || '—'}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title="Correlation">Corr</abbr>
                  <strong>{snap.correlation || '—'}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title="Positioning">Pos</abbr>
                  <strong>{snap.positioning || '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* CATALYST MAP */}
          <div className="mo-macro-timing__catalyst-panel">
            <p className="mo-macro-timing__block-title">Catalyst map</p>
            <ul className="mo-macro-timing__catalyst-list">
              {catalystParsed.map((row, i) => (
                <li key={i} className="mo-macro-timing__catalyst-pill">
                  <span className="mo-macro-timing__catalyst-tag">{row.tag}</span>
                  <span className="mo-macro-timing__catalyst-insight">{row.insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* EXPECTED + CONDITIONS */}
          <div className="mo-macro-timing__dual">
            <div className="mo-macro-timing__dual-col">
              <p className="mo-macro-timing__dual-head">Expected</p>
              <dl className="mo-macro-timing__kv">
                <div className="mo-macro-timing__kv-row">
                  <dt>Base</dt>
                  <dd>{stripExpectedPrefix(behavior[0]) || '—'}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>If triggered</dt>
                  <dd>{stripExpectedPrefix(behavior[1]) || '—'}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>Failure</dt>
                  <dd>{stripExpectedPrefix(behavior[2]) || '—'}</dd>
                </div>
              </dl>
            </div>
            <div className="mo-macro-timing__dual-divider" aria-hidden />
            <div className="mo-macro-timing__dual-col">
              <p className="mo-macro-timing__dual-head">Conditions</p>
              <dl className="mo-macro-timing__kv">
                <div className="mo-macro-timing__kv-row">
                  <dt>Breakout</dt>
                  <dd>{matrix.breakout || '—'}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>Mean rev</dt>
                  <dd>{matrix.meanReversion || '—'}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>No trade</dt>
                  <dd>{matrix.noTradeZone || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* EXECUTION CONTEXT */}
          <div className="mo-macro-timing__exec-context">
            <p className="mo-macro-timing__block-title">Execution context</p>
            <dl className="mo-macro-timing__kv mo-macro-timing__kv--exec">
              {executionContext.map((row, i) => (
                <div key={i} className="mo-macro-timing__kv-row mo-macro-timing__kv-row--exec">
                  <dt>{row.label}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* TRADER EDGE */}
          <footer className="mo-macro-timing__edge-bar">
            <p className="mo-macro-timing__block-title mo-macro-timing__block-title--edge">Trader timing edge</p>
            <ul className="mo-macro-timing__edge-bullets">
              {edgeLines.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </footer>
        </div>
      </div>
    </section>
  );
}
