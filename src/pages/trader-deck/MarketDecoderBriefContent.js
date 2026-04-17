/**
 * Full Market Decoder brief panels — shared layout for embedded page or preview modal.
 */
import React, { useMemo, useRef, useCallback } from 'react';
import { FiChevronRight, FiArrowUpRight, FiArrowDownRight } from 'react-icons/fi';
import MarketDecoderChart from './MarketDecoderChart';
import {
  DecoderReadinessBlock,
  DecoderMarketStateOverlay,
  DecoderDecisionBar,
  DecoderSmartAlerts,
  DecoderEventRiskHeader,
} from './MarketDecoderBriefEnhancements';
import { formatPairLabel } from '../../lib/market/formatPairLabel';
import { sanitizeTraderDeskPayloadDeep } from '../../utils/sanitizeAiDeskOutput';

const {
  buildDecoderPriceContext,
  formatDecoderPriceOrDash,
  formatCrossTilePrice,
  formatDecoderMetricPercent,
} = require('../../utils/decoderDisplayFormat');

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) {
    return null;
  }
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function parseNumberLoose(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const out = Number(m[0]);
  return Number.isFinite(out) ? out : null;
}

function formatNewsTime(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso).slice(0, 19);
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(0, 16);
  }
}

const INSTRUMENT_NEWS_KEYS = {
  EURUSD: ['eur', 'euro', 'usd', 'dollar', 'ecb', 'fed', 'europe', 'us'],
  GBPUSD: ['gbp', 'pound', 'boe', 'uk', 'britain', 'usd', 'dollar', 'fed'],
  USDJPY: ['usd', 'dollar', 'jpy', 'yen', 'boj', 'japan', 'fed'],
  XAUUSD: ['gold', 'xau', 'bullion', 'usd', 'dollar', 'fed', 'real yield', 'treasury'],
  BTCUSD: ['btc', 'bitcoin', 'crypto', 'digital asset', 'usd', 'dollar'],
  SPY: ['spy', 's&p', 'sp500', 'equity', 'stocks', 'fed', 'earnings'],
};

function normalizeHeadlineText(value) {
  return String(value || '').toLowerCase();
}

function buildHeadlineBuckets(asset, list) {
  const items = Array.isArray(list) ? list : [];
  const keys = INSTRUMENT_NEWS_KEYS[String(asset || '').toUpperCase()] || [String(asset || '').toLowerCase()];
  const scored = items.map((item) => {
    const hay = `${normalizeHeadlineText(item.title)} ${normalizeHeadlineText(item.source)}`;
    const score = keys.reduce((acc, key) => (hay.includes(key) ? acc + 1 : acc), 0);
    return { item, score };
  });
  const relevant = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.item);
  const fallback = scored.filter((x) => x.score === 0).map((x) => x.item);
  return {
    relevant: relevant.slice(0, 6),
    fallback: fallback.slice(0, 4),
    total: items.length,
  };
}

function biasValueClass(bias) {
  const b = (bias || '').toLowerCase();
  if (b === 'bullish') return 'md-ref-val md-ref-val--bull';
  if (b === 'bearish') return 'md-ref-val md-ref-val--bear';
  if (b.includes('unclassif') || b.includes('insufficient')) return 'md-ref-val md-ref-val--warn';
  return 'md-ref-val md-ref-val--neutral';
}

function liquidityLabel(state) {
  if (!state) return null;
  const s = String(state);
  if (s === 'untapped') return 'Untapped';
  if (s === 'tested') return 'Tested';
  if (s === 'swept') return 'Swept';
  return s;
}

function crossAssetCardsFromLines(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const find = (re) => arr.find((l) => re.test(String(l))) || '';
  const goldL = find(/gold|xau/i);
  const spyL = find(/spy|s&p|equity/i);
  let thirdL = find(/\boil\b|wti|brent|\bcl\b/i);
  let thirdLabel = 'Oil';
  if (!thirdL) {
    thirdL = find(/\bbtc\b/i);
    if (thirdL) thirdLabel = 'BTC';
  }
  const tone = (line) => {
    if (!line) return 'flat';
    const m = String(line).match(/([+-]?\d+\.?\d*)\s*%/);
    const n = m ? Number(m[1]) : 0;
    if (n > 0.05) return 'up';
    if (n < -0.05) return 'down';
    return 'flat';
  };
  return [
    { label: 'Gold', line: goldL, tone: tone(goldL), icon: 'gold' },
    { label: 'S&P 500', line: spyL, tone: tone(spyL), icon: 'spy' },
    { label: thirdLabel, line: thirdL, tone: tone(thirdL), icon: thirdLabel === 'BTC' ? 'btc' : 'oil' },
  ];
}

function buildTimeline(brief) {
  const out = [];
  const er = brief?.eventRisk;
  if (Array.isArray(er)) {
    er.forEach((e) => {
      const title = e.title || 'Event';
      if (/no scored macro events/i.test(title)) return;
      out.push({ title, hint: e.timeUntil || e.impact || '' });
    });
  }
  const mm = brief?.meta?.marketMeetings;
  if (Array.isArray(mm) && out.length < 3) {
    mm.slice(0, 5).forEach((m) => {
      if (out.length >= 3) return;
      const t = m.title || 'Release';
      if (!out.some((x) => x.title === t)) {
        out.push({ title: t, hint: m.timeUntil || m.date || '' });
      }
    });
  }
  const trimmed = out.slice(0, 3);
  if (!trimmed.length) {
    return [{ title: 'No scored prints in this window', hint: 'Calendar may be empty or pair scope missed overlap' }];
  }
  return trimmed;
}

/** At-a-glance direction only — matches Instant Read, not the granular pulse score label. */
function pulseDirectionLabel(brief) {
  const direct = brief?.instantRead?.bias;
  if (direct) return direct;
  const raw = brief?.marketPulse?.biasLabel || 'Neutral';
  const s = String(raw).toLowerCase();
  if (s.includes('bull')) return 'Bullish';
  if (s.includes('bear')) return 'Bearish';
  return 'Neutral';
}

function pulseContextLine(brief) {
  const state = brief?.marketPulse?.marketState || brief?.instantRead?.tradingCondition || '';
  const s = String(state).trim();
  if (!s || s.length > 72) return '';
  return s;
}

function CrossArrow({ tone, diag }) {
  if (tone === 'up') {
    return diag ? <FiArrowUpRight className="md-ref-cross-arrow-ico md-ref-cross-arrow-ico--gold" aria-hidden /> : <span className="md-ref-cross-arrow-ico md-ref-cross-arrow-ico--up" aria-hidden>▲</span>;
  }
  if (tone === 'down') {
    return diag ? <FiArrowDownRight className="md-ref-cross-arrow-ico md-ref-cross-arrow-ico--down" aria-hidden /> : <span className="md-ref-cross-arrow-ico md-ref-cross-arrow-ico--down" aria-hidden>▼</span>;
  }
  return <span className="md-ref-cross-arrow-ico md-ref-cross-arrow-ico--flat" aria-hidden>—</span>;
}

export default function MarketDecoderBriefContent({ brief: rawBrief, q }) {
  const brief = useMemo(
    () => (rawBrief && typeof rawBrief === 'object' ? sanitizeTraderDeskPayloadDeep(rawBrief) : null),
    [rawBrief]
  );
  const moreDetailsRef = useRef(null);

  const openScenarioDetails = useCallback(() => {
    const el = moreDetailsRef.current;
    if (!el) return;
    el.open = true;
    requestAnimationFrame(() => {
      const target = document.getElementById('md-decoder-scenario-detail');
      const scrollRoot = el.closest('.md-decoder-intel-scroll');
      if (!scrollRoot || !target) return;
      const rootRect = scrollRoot.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const pad = 12;
      if (tRect.bottom > rootRect.bottom - pad) {
        scrollRoot.scrollTop += tRect.bottom - rootRect.bottom + pad;
      }
    });
  }, []);

  const headlinePack = useMemo(() => {
    const meta = brief?.meta;
    if (Array.isArray(meta?.instrumentHeadlines) && meta.instrumentHeadlines.length > 0) {
      return {
        items: meta.instrumentHeadlines,
        scope: meta.headlineScope === 'relevant' ? 'relevant' : meta.headlineScope === 'none' ? 'none' : 'fallback',
        total: typeof meta.headlineTotal === 'number' ? meta.headlineTotal : meta.instrumentHeadlines.length,
      };
    }
    const b = buildHeadlineBuckets(brief?.instrument?.display || brief?.header?.asset, brief?.meta?.anchorNews);
    return {
      items: b.relevant.length ? b.relevant : b.fallback,
      scope: b.relevant.length ? 'relevant' : 'fallback',
      total: b.total,
    };
  }, [brief]);

  const refTimeline = useMemo(() => (brief ? buildTimeline(brief) : []), [brief]);
  const refCrossLegacy = useMemo(() => (brief ? crossAssetCardsFromLines(brief.crossAssetContext) : []), [brief]);
  const crossTiles = brief?.crossAssetTiles?.length ? brief.crossAssetTiles : null;
  const priceCtx = useMemo(() => (brief ? buildDecoderPriceContext(brief) : null), [brief]);

  if (!brief) return null;

  const mt = brief?.instrument?.marketType || brief?.header?.marketType || 'FX';
  const changePct = parseNumberLoose(brief.header?.changePercent);
  const instrumentHeadlines = headlinePack.items;
  const showingFallbackHeadlines = headlinePack.scope === 'fallback' || headlinePack.scope === 'none';
  const levelRows = Array.isArray(brief.keyLevels?.detailRows) ? brief.keyLevels.detailRows : [];
  const conv = brief.instantRead?.conviction || '';
  const convFill =
    conv === 'High' ? 100 : conv === 'Medium' ? 66 : conv === 'Low' ? 33 : /unavail|n\/a/i.test(conv) ? 0 : 0;
  const tc = brief.instantRead?.tradingCondition || brief.marketPulse?.marketState || '';
  const tcClass =
    String(tc)
      .toLowerCase()
      .includes('event')
      ? 'md-regime-pill--event'
      : String(tc).toLowerCase().includes('chop')
        ? 'md-regime-pill--chop'
        : String(tc).toLowerCase().includes('trend')
          ? 'md-regime-pill--trend'
          : String(tc).toLowerCase().includes('range')
            ? 'md-regime-pill--range'
            : 'md-regime-pill--neutral';
  const scenario = brief.decoderScenario || {};
  const eventScopeLabel =
    brief.eventRiskSummary?.scope === 'pair'
      ? 'Pair-scoped calendar'
      : brief.eventRiskSummary?.scope === 'global'
        ? 'Global calendar'
        : '';

  const assetLabel = brief.instrument?.display || brief.header?.asset;
  const sparseHint = brief.meta?.sparseSeries
    ? 'Sparse history — MAs / pivots are indicative until full daily load.'
    : null;
  const ds = brief.meta?.dataSufficiency;
  const dataSufficiencyWarn = ds && ds.sufficientForStructure === false;
  const pulseBias = pulseDirectionLabel(brief);
  const pulseSub = pulseContextLine(brief);
  const changePctUnavailableTitle =
    'Session change % is not available for this snapshot. Common causes: degraded quote, missing session change field, or no daily bars yet (see the desk / quote line under the header).';

  return (
    <div className="md-ref-brief-layout">
      {dataSufficiencyWarn ? (
        <div className="md-ref-data-sufficiency-banner" role="alert">
          <strong>Insufficient daily history for full structure</strong>
          <p>
            Loaded {ds.dailyBarCount ?? 0} daily bar(s); need at least {ds.minBarsRequired ?? 5} to score MAs, pivots, and
            directional bias. Live quote and calendar may still apply — confirm levels on your charts.
          </p>
          {ds.calendarOk === false ? (
            <p className="md-ref-data-sufficiency-sub">Economic calendar did not load for this request.</p>
          ) : null}
        </div>
      ) : null}
      <div className="md-ref-grid md-ref-grid--dense">
        <aside className="md-ref-col md-ref-col--left">
          <div className="md-ref-unified-rail md-ref-unified-rail--left">
            <div className="md-ref-unified-section">
              <h2 className="md-ref-unified-h">Instant Read</h2>
              <div className="md-ref-rows">
              <div className="md-ref-row">
                <span className="md-ref-k">Bias</span>
                <span className={biasValueClass(brief.instantRead?.bias || brief.marketPulse?.biasLabel)}>
                  {brief.instantRead?.bias || brief.marketPulse?.biasLabel || 'Neutral'}
                </span>
              </div>
              <div className="md-ref-row">
                <span className="md-ref-k">Conviction</span>
                <span className="md-ref-v md-ref-v--convict">
                  {conv || '—'}
                  {conv ? (
                    <span className="md-convict-bar" aria-hidden>
                      <span className="md-convict-bar-fill" style={{ width: `${convFill}%` }} />
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="md-ref-row">
                <span className="md-ref-k">Trading Condition</span>
                <span className="md-ref-v md-ref-v--regime">
                  <span className={`md-regime-pill ${tcClass}`}>{tc || '—'}</span>
                </span>
              </div>
              <div className="md-ref-row md-ref-row--gold md-ref-row--approach">
                <span className="md-ref-k">Best Approach</span>
                <span className="md-ref-v md-ref-v--gold">{brief.instantRead?.bestApproach || '—'}</span>
              </div>
            </div>
            </div>

            <div className="md-ref-unified-section">
              <h2 className="md-ref-unified-h">Key Levels</h2>
              <div className="md-ref-levels-dense">
              {levelRows.length ? (
                levelRows.map((row) => (
                  <div key={row.key} className="md-ref-level-line">
                    <div className="md-ref-level-line-main">
                      <span className="md-ref-level-label">{row.label}</span>
                      <span className="md-ref-level-price">{row.display || '—'}</span>
                    </div>
                    <div className="md-ref-level-meta">
                      {row.liquidity ? <span className="md-liq-tag">{liquidityLabel(row.liquidity)}</span> : null}
                      {row.distancePct != null ? (
                        <span>{formatDecoderMetricPercent(row.distancePct)}% from spot</span>
                      ) : null}
                      {row.note ? <span className="md-ref-level-note">{row.note}</span> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="md-ref-rows">
                  <div className="md-ref-row">
                    <span className="md-ref-k">Resistance (R1)</span>
                    <span className="md-ref-v">{formatDecoderPriceOrDash(brief.keyLevels?.resistance1, priceCtx)}</span>
                  </div>
                  <div className="md-ref-row">
                    <span className="md-ref-k">Support (S1)</span>
                    <span className="md-ref-v">{formatDecoderPriceOrDash(brief.keyLevels?.support1, priceCtx)}</span>
                  </div>
                </div>
              )}
            </div>
            </div>

            <div className="md-ref-unified-section">
              <h2 className="md-ref-unified-h">Cross-Asset Context</h2>
              {crossTiles ? (
              <div
                className={`md-ref-cross-grid md-ref-cross-grid--tiles${
                  crossTiles.length === 3 ? ' md-ref-cross-grid--tiles-3' : ''
                }`}
              >
                {crossTiles.map((t) => (
                  <div
                    key={t.id}
                    className={`md-ref-cross-tile md-ref-cross-tile--${
                      (t.changePercent ?? 0) > 0 ? 'up' : (t.changePercent ?? 0) < 0 ? 'down' : 'flat'
                    }`}
                  >
                    <span className="md-ref-cross-name">{t.label}</span>
                    <span className="md-ref-cross-price">
                      {t.price != null && Number.isFinite(t.price) ? formatCrossTilePrice(t.price, t.id) : '—'}
                    </span>
                    <span className="md-ref-cross-rel">{t.relation}</span>
                    <span className="md-ref-cross-chg">
                      {t.changePercent != null && Number.isFinite(t.changePercent) ? formatPct(t.changePercent) : '—'}
                    </span>
                    {t.hint && !t.available ? (
                      <span className="md-ref-cross-hint" title={t.hint}>
                        {t.hint}
                      </span>
                    ) : null}
                    <CrossArrow
                      tone={(t.changePercent ?? 0) > 0 ? 'up' : (t.changePercent ?? 0) < 0 ? 'down' : 'flat'}
                      diag={t.id === 'spy'}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="md-ref-cross-grid">
                {refCrossLegacy.map((card) => (
                  <div key={card.label} className={`md-ref-cross-tile md-ref-cross-tile--${card.tone}`}>
                    <span className={`md-ref-cross-ico md-ref-cross-ico--${card.icon}`} aria-hidden />
                    <span className="md-ref-cross-name">{card.label}</span>
                    <CrossArrow tone={card.tone} diag={card.icon === 'spy'} />
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </aside>

        <div className="md-ref-col md-ref-col--center">
          <section className="md-mse md-ref-panel md-ref-panel--unified md-ref-panel--chart">
            <div className="md-mse-top">
              <div className="md-ref-chart-head md-mse-head">
                <span className="md-ref-pair">{formatPairLabel(assetLabel)}</span>
                <span className="md-ref-last">{formatDecoderPriceOrDash(brief.header.price, priceCtx)}</span>
                <span
                  className={
                    changePct != null && changePct >= 0
                      ? 'md-ref-pct md-ref-pct--up'
                      : changePct != null
                        ? 'md-ref-pct md-ref-pct--down'
                        : 'md-ref-pct md-ref-pct--na'
                  }
                  title={changePct == null ? changePctUnavailableTitle : undefined}
                  aria-label={changePct == null ? 'Session change percent not available' : undefined}
                >
                  {changePct != null ? (
                    <>
                      {formatPct(changePct)}
                      {changePct >= 0 ? ' ▲' : ' ▼'}
                    </>
                  ) : (
                    <>
                      Δ <span className="md-ref-pct-na-mark">—</span>
                    </>
                  )}
                </span>
              </div>
              <div className="md-mse-meta">
                {brief.sessionFlow?.currentSession ? (
                  <span className="md-mse-desk">Desk · {brief.sessionFlow.currentSession}</span>
                ) : null}
                {brief.meta?.freshness ? (
                  <span
                    className={`md-mse-note${brief.meta.freshness.quoteOk ? '' : ' md-mse-note--warn'}`}
                    title="Underlying quote + daily series state for this decode"
                  >
                    {brief.meta.freshness.quoteOk ? 'Quote ok' : 'Quote degraded'}
                    {brief.meta.freshness.dailyBarCount != null ? ` · ${brief.meta.freshness.dailyBarCount}d bars` : ''}
                  </span>
                ) : null}
                {sparseHint ? <span className="md-mse-note md-mse-note--warn">{sparseHint}</span> : null}
                {brief.chartOverlay?.note ? <span className="md-mse-note">{brief.chartOverlay.note}</span> : null}
              </div>
            </div>
            <div className="md-mse-chart-shell">
              <MarketDecoderChart
                bars={brief.meta?.chartBars}
                compact={false}
                referenceStyle
                overlays={brief.chartOverlay}
                placeholderSparkline={brief.meta?.sparkline}
              />
              <DecoderMarketStateOverlay brief={brief} />
            </div>
          </section>

          <section className="md-ref-panel md-ref-panel--surface md-ref-panel--timeline-compact">
            <h2 className="md-ref-unified-h md-ref-unified-h--inline">Event Risk</h2>
            <DecoderEventRiskHeader summary={brief.eventRiskSummary} scopeLabel={eventScopeLabel} />
            <div className="md-ref-timeline">
              <span className="md-ref-tl-cap">Today</span>
              <div className="md-ref-tl-track">
                {refTimeline.map((ev, idx) => (
                  <div key={`${ev.title}-${idx}`} className="md-ref-tl-node-wrap">
                    <span className="md-ref-tl-node" />
                    <span className="md-ref-tl-label">{ev.title}</span>
                    {ev.hint ? <span className="md-ref-tl-hint">{ev.hint}</span> : null}
                  </div>
                ))}
              </div>
              <span className="md-ref-tl-cap md-ref-tl-cap--end">Fri</span>
            </div>
          </section>
        </div>

        <aside className="md-ref-col md-ref-col--right md-ref-col--rail">
          <div className="md-ref-unified-rail md-ref-unified-rail--right">
            <div className="md-ref-rail-grid">
              <div className="md-ref-rail-cell md-ref-rail-cell--anchor md-ref-rail-cell--pulse">
              <h2 className="md-ref-unified-h">Market Pulse</h2>
              {brief.marketPulse ? (
                <>
                  <div className="md-ref-pulse-hero md-ref-pulse-hero--simple">
                    <div className="md-ref-gauge md-ref-gauge--rail md-ref-gauge--premium" aria-hidden>
                      <div className="md-ref-gauge-backdrop" />
                      <div className="md-ref-gauge-track md-ref-gauge-track--premium">
                        <span className="md-ref-g-l md-ref-g-l--bear">Bear</span>
                        <span className="md-ref-g-l md-ref-g-l--mid">Neu</span>
                        <span className="md-ref-g-l md-ref-g-l--bull">Bull</span>
                      </div>
                      <div
                        className="md-ref-g-needle md-ref-g-needle--premium"
                        style={{
                          transform: `rotate(${-90 + (Number(brief.marketPulse.gaugePosition ?? 50) / 100) * 180}deg)`,
                        }}
                      />
                      <span className="md-ref-gauge-hub" aria-hidden />
                    </div>
                  </div>
                  <p className={`md-ref-pulse-bias md-ref-pulse-bias--${String(pulseBias).toLowerCase()}`}>{pulseBias}</p>
                  {pulseSub ? <p className="md-ref-pulse-context">{pulseSub}</p> : null}
                </>
              ) : (
                <p className="md-ref-muted">Pulse n/a</p>
              )}
              </div>

              <div className="md-ref-rail-cell md-ref-rail-cell--anchor md-ref-rail-cell--readiness">
              <h2 className="md-ref-unified-h">Trade Readiness</h2>
              <DecoderReadinessBlock readiness={brief.readiness} />
              </div>

              <div className="md-ref-rail-cell md-ref-rail-cell--insights">
              <h2 className="md-ref-unified-h">Market Insights</h2>
              <div className="md-ref-insights-grid md-ref-insights-grid--rail">
                <div className="md-ref-insights-cell">
                  <span className="md-ref-insights-k">RSI (14)</span>
                  <span className="md-ref-insights-v">
                    {brief.insights?.rsi != null
                      ? `${formatDecoderMetricPercent(brief.insights.rsi, 1) ?? brief.insights.rsi} · ${brief.insights.rsiState || ''}`
                      : '—'}
                  </span>
                </div>
                <div className="md-ref-insights-cell">
                  <span className="md-ref-insights-k">ADR (5d)</span>
                  <span className="md-ref-insights-v">
                    {brief.insights?.adrPercent != null ? `${formatDecoderMetricPercent(brief.insights.adrPercent)}%` : '—'}
                  </span>
                </div>
                <div className="md-ref-insights-cell">
                  <span className="md-ref-insights-k">Momentum</span>
                  <span className="md-ref-insights-v">{brief.insights?.momentum || '—'}</span>
                </div>
                <div className="md-ref-insights-cell">
                  <span className="md-ref-insights-k">Structure</span>
                  <span className="md-ref-insights-v">{brief.insights?.structureState || '—'}</span>
                </div>
              </div>
              {brief.insights?.stateSummary ? (
                <p className="md-ref-insights-summary">{brief.insights.stateSummary}</p>
              ) : null}
              </div>

              <div className="md-ref-rail-cell md-ref-rail-cell--scen">
              <h2 className="md-ref-unified-h">Scenario Map</h2>
              <button type="button" className="md-ref-scen-row md-ref-scen-row--action md-ref-scen-row--dense" onClick={openScenarioDetails}>
                <span className="md-ref-scen-k">Upside</span>
                <span className="md-ref-scen-v">{formatDecoderPriceOrDash(scenario.upsideTarget, priceCtx)}</span>
                <FiChevronRight className="md-ref-scen-chev" aria-hidden />
              </button>
              <button type="button" className="md-ref-scen-row md-ref-scen-row--action md-ref-scen-row--dense" onClick={openScenarioDetails}>
                <span className="md-ref-scen-k">Downside</span>
                <span className="md-ref-scen-v">{formatDecoderPriceOrDash(scenario.downsideRisk, priceCtx)}</span>
                <FiChevronRight className="md-ref-scen-chev" aria-hidden />
              </button>
              <div className="md-ref-scen-row md-ref-scen-row--dense">
                <span className="md-ref-scen-k">Invalidation</span>
                <span className="md-ref-scen-v">{formatDecoderPriceOrDash(scenario.invalidation, priceCtx)}</span>
              </div>
              <div className="md-ref-scen-row md-ref-scen-row--dense">
                <span className="md-ref-scen-k">Pivot</span>
                <span className="md-ref-scen-v">{formatDecoderPriceOrDash(scenario.trigger, priceCtx)}</span>
              </div>
              {scenario.tone ? (
                <div className="md-ref-scen-tone md-ref-scen-tone--dense">
                  Tone · <strong>{scenario.tone}</strong>
                </div>
              ) : null}
              </div>
            </div>

            <div className="md-ref-unified-section md-ref-unified-section--alerts">
              <h2 className="md-ref-unified-h">Smart Alerts</h2>
              <DecoderSmartAlerts alerts={brief.smartAlerts} />
              {brief.executionGuidance?.riskConsideration ? (
                <p className="md-ref-exec-risknote">{brief.executionGuidance.riskConsideration}</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <footer className="md-ref-footer-decision">
        <DecoderDecisionBar
          confirmation={brief.confirmationEngine}
          postureHeadline={brief.finalOutput?.currentPosture}
          postureSub={brief.finalOutput?.postureSubtitle}
          fallbackAction={brief.finalOutput?.deckAction}
        />
      </footer>

      <details ref={moreDetailsRef} className="md-ref-more">
        <summary className="md-ref-more-sum">More context — headlines, calendar, scenarios</summary>
        <div className="md-ref-more-inner">
          <section className="md-ref-panel md-ref-panel--flat">
            <h3 className="md-ref-subh">What matters now</h3>
            <ul className="md-decoder-bullets">
              {(brief.whatMattersNow || []).map((item) => (
                <li key={item.label}>
                  <strong>{item.label}:</strong> {item.text}
                </li>
              ))}
            </ul>
          </section>
          {brief.scenarioMap ? (
            <section id="md-decoder-scenario-detail" className="md-ref-panel md-ref-panel--flat">
              <h3 className="md-ref-subh">Scenario detail</h3>
              <div className="md-decoder-scenario">
                <div className="md-decoder-scenario-block">
                  <div className="md-decoder-scenario-label md-decoder-scenario-label--bull">Bullish scenario</div>
                  <p className="md-decoder-small" style={{ marginTop: 0 }}>
                    <strong>Condition:</strong> {brief.scenarioMap.bullish?.condition}
                  </p>
                  <p className="md-decoder-small">
                    <strong>Outcome:</strong> {brief.scenarioMap.bullish?.outcome}
                  </p>
                </div>
                <div className="md-decoder-scenario-block">
                  <div className="md-decoder-scenario-label md-decoder-scenario-label--bear">Bearish scenario</div>
                  <p className="md-decoder-small" style={{ marginTop: 0 }}>
                    <strong>Condition:</strong> {brief.scenarioMap.bearish?.condition}
                  </p>
                  <p className="md-decoder-small">
                    <strong>Outcome:</strong> {brief.scenarioMap.bearish?.outcome}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
          <section className="md-ref-panel md-ref-panel--flat">
            <h3 className="md-ref-subh">Event risk · releases</h3>
            {(brief.eventRisk || []).length === 0 && !(brief.meta?.marketMeetings || []).length ? (
              <p className="md-decoder-small">No events parsed for this view.</p>
            ) : (
              <ul className="md-decoder-line-list">
                {(brief.eventRisk || []).map((ev, i) => (
                  <li key={`er-${i}`}>
                    <strong>{ev.title}</strong>
                    {ev.timeUntil ? ` — ${ev.timeUntil}` : ''} · Impact: {ev.impact}
                  </li>
                ))}
                {(brief.meta?.marketMeetings || []).map((ev, i) => (
                  <li key={`mm-${i}`}>
                    <strong>{ev.title}</strong>
                    {ev.timeUntil ? ` — ${ev.timeUntil}` : ''}
                    {ev.date ? ` · ${ev.date}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="md-ref-panel md-ref-panel--flat">
            <h3 className="md-ref-subh">Headlines · {assetLabel}</h3>
            {instrumentHeadlines.length > 0 ? (
              <>
                <p className="md-meets-scope md-decoder-small">
                  {headlinePack.scope === 'none'
                    ? 'No headlines returned for this decode.'
                    : showingFallbackHeadlines
                      ? `Broader macro context from ${headlinePack.total} headlines.`
                      : `${instrumentHeadlines.length} headlines ranked for ${assetLabel}.`}
                </p>
                <ul className="md-anchor-news-list">
                  {instrumentHeadlines.map((item, i) => {
                    const href = String(item.url || '').trim();
                    const safe = href && href !== '#';
                    return (
                      <li key={`${href}-${i}`}>
                        {safe ? (
                          <a className="md-anchor-news-link" href={href} target="_blank" rel="noopener noreferrer">
                            {item.title || 'Open article'}
                          </a>
                        ) : (
                          <span className="md-anchor-news-title">{item.title || 'Headline'}</span>
                        )}
                        <div className="md-anchor-news-meta">
                          {item.source ? <span>{item.source}</span> : null}
                          {item.datetime ? <span className="md-anchor-news-time">{formatNewsTime(item.datetime)}</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="md-decoder-small">No headlines matched for this symbol.</p>
            )}
          </section>
          <section className="md-ref-panel md-ref-panel--flat">
            <h3 className="md-ref-subh">Positioning</h3>
            <div className="md-decoder-levels">
              <div className="md-decoder-level-row">
                <span className="md-decoder-kv-label">Retail sentiment</span>
                <span>{brief.positioning?.retailSentiment}</span>
              </div>
              <div className="md-decoder-level-row">
                <span className="md-decoder-kv-label">COT</span>
                <span>{brief.positioning?.cot}</span>
              </div>
              <div className="md-decoder-level-row">
                <span className="md-decoder-kv-label">Crowd bias</span>
                <span>{brief.positioning?.crowdBias}</span>
              </div>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
