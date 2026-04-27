import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeFreshness } from '../../lib/trader-deck/marketOutlookDisplayFormatters';

function levelMod(level) {
  const L = String(level || '').toUpperCase();
  if (L === 'HIGH') return 'high';
  if (L === 'LOW') return 'low';
  return 'medium';
}

/** Parse `[TAG] insight` catalyst lines into badge + body */
function parseCatalystRow(line, dash) {
  const m = String(line || '').match(/^\[([^\]]+)\]\s*(.+)$/);
  return m ? { tag: m[1].trim(), insight: m[2].trim() } : { tag: dash, insight: String(line || dash).trim() };
}

/** Strip verbose prefixes from expected-path bullets for scanning */
function stripExpectedPrefix(line) {
  return String(line || '')
    .replace(/^Base case:\s*/i, '')
    .replace(/^Base:\s*/i, '')
    .replace(/^Conditional:\s*/i, '')
    .replace(/^If triggered:\s*/i, '')
    .replace(/^Failure case:\s*/i, '')
    .replace(/^Failure mode:\s*/i, '')
    .replace(/^Failure:\s*/i, '')
    .trim();
}

function badgeLevel(level, dash, t) {
  const L = String(level || '').toUpperCase();
  if (L === 'MEDIUM') return t('traderDeck.macroGen.badge_med');
  if (L === 'HIGH') return t('traderDeck.macroGen.badge_high');
  if (L === 'LOW') return t('traderDeck.macroGen.badge_low');
  return L || dash;
}

export default function MacroTimingInflectionPanel({ model, updatedAt }) {
  const { t } = useTranslation();
  const dash = t('traderDeck.eta.emDash');
  const sep = t('traderDeck.macroGen.sep');
  const m = model && typeof model === 'object' ? model : {};
  const timing = m.activeTimingWindow && typeof m.activeTimingWindow === 'object' ? m.activeTimingWindow : {};
  const inflect = m.inflectionRisk && typeof m.inflectionRisk === 'object' ? m.inflectionRisk : {};
  const snap = m.marketStateSnapshot && typeof m.marketStateSnapshot === 'object' ? m.marketStateSnapshot : {};
  const catalystLines = Array.isArray(m.catalystLines) ? m.catalystLines : [];
  const behavior = Array.isArray(m.expectedBehavior) ? m.expectedBehavior : [];
  const matrix = m.tradeConditionsMatrix && typeof m.tradeConditionsMatrix === 'object' ? m.tradeConditionsMatrix : {};
  const edgeLines = Array.isArray(m.traderEdgeLines) ? m.traderEdgeLines : [];
  const executionContext = Array.isArray(m.executionContext) ? m.executionContext : [];
  const riskFraming = Array.isArray(m.riskFraming) ? m.riskFraming : [];

  const lvlMod = levelMod(inflect.level);

  const catalystParsed = useMemo(
    () => catalystLines.slice(0, 5).map((line) => parseCatalystRow(line, dash)),
    [catalystLines, dash],
  );

  const timingStatus = timing.status || dash;
  const catalystClock =
    timing.timeToCatalyst ||
    (timing.headline ? timing.headline.split(sep)[1] : null) ||
    dash;

  const timingSubline = [catalystClock, timing.executionNote || timing.executionImplication].filter(Boolean).join(sep);

  return (
    <section
      className="td-outlook-concept-card td-outlook-concept-card--macro-timing mo-card-shell mo-macro-timing--stretch"
      aria-label={t('traderDeck.macro.aria')}
    >
      <header className="mo-macro-timing__header-row td-outlook-concept-card__head td-outlook-concept-card__head--macro-timing">
        <h2 className="mo-macro-timing__title-main td-outlook-concept-card__title td-outlook-concept-card__title--macro-timing">
          {t('traderDeck.macro.title')}
        </h2>
        <span className="mo-macro-timing__updated" title={updatedAt || ''}>
          {formatRelativeFreshness(updatedAt) || dash}
        </span>
      </header>

      <div className="td-outlook-concept-card__body td-outlook-concept-card__body--macro-timing mo-macro-timing__body-fill">
        <div className="mo-macro-timing__stack mo-macro-timing__stack--terminal">
          {/* TOP STRIP — 3 blocks */}
          <div className="mo-macro-timing__top-strip">
            <div className="mo-macro-timing__micro mo-macro-timing__micro--timing">
              <span className="mo-macro-timing__micro-label">{t('traderDeck.macro.activeWindow')}</span>
              <strong className="mo-macro-timing__micro-value">{timingStatus}</strong>
              <span className="mo-macro-timing__micro-sub">{timingSubline || dash}</span>
            </div>

            <div className="mo-macro-timing__micro mo-macro-timing__micro--inflect">
              <span className="mo-macro-timing__micro-label">{t('traderDeck.macro.inflection')}</span>
              <span className={`mo-macro-timing__risk-badge mo-macro-timing__risk-badge--${lvlMod}`}>
                {badgeLevel(inflect.level, dash, t)}
              </span>
              <span className="mo-macro-timing__micro-sub">{inflect.reason || inflect.explanation || ''}</span>
            </div>

            <div className="mo-macro-timing__micro mo-macro-timing__micro--state">
              <span className="mo-macro-timing__micro-label">{t('traderDeck.macro.marketState')}</span>
              <div className="mo-macro-timing__state-mini">
                <span className="mo-macro-timing__state-item">
                  <abbr title={t('traderDeck.macro.abbrVolTitle')}>{t('traderDeck.macro.abbrVol')}</abbr>
                  <strong>{snap.volRegime || dash}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title={t('traderDeck.macro.abbrLiqTitle')}>{t('traderDeck.macro.abbrLiq')}</abbr>
                  <strong>{snap.liquidity || dash}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title={t('traderDeck.macro.abbrCorrTitle')}>{t('traderDeck.macro.abbrCorr')}</abbr>
                  <strong>{snap.correlation || dash}</strong>
                </span>
                <span className="mo-macro-timing__state-item">
                  <abbr title={t('traderDeck.macro.abbrPosTitle')}>{t('traderDeck.macro.abbrPos')}</abbr>
                  <strong>{snap.positioning || dash}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* CATALYST MAP */}
          <div className="mo-macro-timing__catalyst-panel">
            <p className="mo-macro-timing__block-title">{t('traderDeck.macro.catalystMap')}</p>
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
            <div className="mo-macro-timing__dual-col mo-macro-timing__dual-col--expected-path">
              <p className="mo-macro-timing__dual-head">{t('traderDeck.macro.expectedPath')}</p>
              <dl className="mo-macro-timing__kv">
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.base')}</dt>
                  <dd>{stripExpectedPrefix(behavior[0]) || dash}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.ifTriggered')}</dt>
                  <dd>{stripExpectedPrefix(behavior[1]) || dash}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.failureMode')}</dt>
                  <dd>{stripExpectedPrefix(behavior[2]) || dash}</dd>
                </div>
              </dl>
            </div>
            <div className="mo-macro-timing__dual-divider" aria-hidden />
            <div className="mo-macro-timing__dual-col">
              <p className="mo-macro-timing__dual-head">{t('traderDeck.macro.conditions')}</p>
              <dl className="mo-macro-timing__kv">
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.breakout')}</dt>
                  <dd>{matrix.breakout || dash}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.meanRev')}</dt>
                  <dd>{matrix.meanReversion || dash}</dd>
                </div>
                <div className="mo-macro-timing__kv-row">
                  <dt>{t('traderDeck.macro.noTrade')}</dt>
                  <dd>{matrix.noTradeZone || dash}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* EXECUTION CONTEXT */}
          <div className="mo-macro-timing__exec-context">
            <p className="mo-macro-timing__block-title">{t('traderDeck.macro.executionContext')}</p>
            <dl className="mo-macro-timing__kv mo-macro-timing__kv--exec">
              {executionContext.map((row, i) => (
                <div key={i} className="mo-macro-timing__kv-row mo-macro-timing__kv-row--exec">
                  <dt>{row.label}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* RISK FRAMING — fills vertical rhythm above trader edge */}
          {riskFraming.length > 0 ? (
            <div className="mo-macro-timing__exec-context mo-macro-timing__risk-framing">
              <p className="mo-macro-timing__block-title">{t('traderDeck.macro.riskFraming')}</p>
              <dl className="mo-macro-timing__kv mo-macro-timing__kv--exec">
                {riskFraming.map((row, i) => (
                  <div key={i} className="mo-macro-timing__kv-row mo-macro-timing__kv-row--exec">
                    <dt>{row.label}</dt>
                    <dd>{row.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {/* TRADER EDGE */}
          <footer className="mo-macro-timing__edge-bar">
            <p className="mo-macro-timing__block-title mo-macro-timing__block-title--edge">{t('traderDeck.macro.traderEdge')}</p>
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
