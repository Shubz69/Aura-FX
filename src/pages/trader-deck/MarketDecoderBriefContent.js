/**
 * Full Market Decoder brief panels — shared layout for embedded page or preview modal.
 */
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { FiChevronRight, FiArrowUpRight, FiArrowDownRight } from 'react-icons/fi';
import MarketDecoderChart from './MarketDecoderChart';

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

function formatLevel(v, marketType) {
  const parsed = parseNumberLoose(v);
  if (parsed == null) {
    return '—';
  }
  const n = parsed;
  if (marketType === 'FX' || marketType === 'Commodity') return n.toFixed(5);
  if (marketType === 'Crypto' && n > 200) return n.toFixed(2);
  return n.toFixed(n < 50 ? 4 : 2);
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
  return 'md-ref-val md-ref-val--neutral';
}

function formatPairLabel(asset) {
  const raw = String(asset || '').toUpperCase();
  const s = raw.replace(/[^A-Z]/g, '');
  if (s.length === 6 && /^[A-Z]{6}$/.test(s)) {
    return `${s.slice(0, 3)}/${s.slice(3)}`;
  }
  if (/XAU/.test(s) || /BTC/.test(s)) {
    const base = s.replace(/USD$/, '');
    return base ? `${base}/USD` : raw || '—';
  }
  return raw || '—';
}

function levelShort(displayStr) {
  if (displayStr == null) return '—';
  const m = String(displayStr).match(/[\d]+(?:\.\d+)?/);
  return m ? m[0] : '—';
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
    er.slice(0, 3).forEach((e) => {
      out.push({ title: e.title || 'Event', hint: e.timeUntil || e.impact || '' });
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
  while (out.length < 3) out.push({ title: '—', hint: '' });
  return out.slice(0, 3);
}

function checklistFromBrief(brief) {
  const ex = brief?.executionGuidance || {};
  const note = brief?.executionNote || {};
  return [
    {
      title: 'Set alerts at key levels',
      sub: ex.preferredDirection || note.preferredDirection || 'Anchor risk around the cited resistance/support grid.',
    },
    {
      title: 'Use tight stops',
      sub: ex.invalidation || note.invalidation || ex.riskConsideration || 'Invalidation should be explicit — no open-ended loss.',
    },
    {
      title: 'Watch for breakouts',
      sub:
        ex.entryCondition ||
        note.confirmationNeeded ||
        brief?.scenarioMap?.bullish?.condition ||
        'Confirmation matters — let structure break before adding.',
    },
  ];
}

function pulseDeskLabel(brief) {
  const bias = brief?.instantRead?.bias || brief?.marketPulse?.biasLabel || 'Neutral';
  const conv = String(brief?.instantRead?.conviction || '').toLowerCase();
  if (conv === 'high') return `Strong ${bias}`;
  if (conv === 'medium') return `Moderate ${bias}`;
  if (conv === 'low') return `Tentative ${bias}`;
  return bias;
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

export default function MarketDecoderBriefContent({ brief, q }) {
  const moreDetailsRef = useRef(null);
  const [execChecked, setExecChecked] = useState(() => [true, true, true]);

  const toggleExec = useCallback((idx) => {
    setExecChecked((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  const openScenarioDetails = useCallback(() => {
    const el = moreDetailsRef.current;
    if (el) {
      el.open = true;
      requestAnimationFrame(() => {
        document.getElementById('md-decoder-scenario-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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
    const b = buildHeadlineBuckets(brief?.header?.asset, brief?.meta?.anchorNews);
    return {
      items: b.relevant.length ? b.relevant : b.fallback,
      scope: b.relevant.length ? 'relevant' : 'fallback',
      total: b.total,
    };
  }, [brief]);

  const refTimeline = useMemo(() => (brief ? buildTimeline(brief) : []), [brief]);
  const refCross = useMemo(() => (brief ? crossAssetCardsFromLines(brief.crossAssetContext) : []), [brief]);
  const refChecklist = useMemo(() => (brief ? checklistFromBrief(brief) : []), [brief]);

  useEffect(() => {
    if (refChecklist.length === 0) return;
    setExecChecked(Array(refChecklist.length).fill(true));
  }, [brief?.header?.asset, brief?.meta?.generatedAt, refChecklist.length]);

  if (!brief) return null;

  const mt = brief?.header?.marketType || 'FX';
  const changePct = parseNumberLoose(brief.header?.changePercent);
  const instrumentHeadlines = headlinePack.items;
  const showingFallbackHeadlines = headlinePack.scope === 'fallback' || headlinePack.scope === 'none';

  return (
    <>
      <div className="md-ref-grid">
        <aside className="md-ref-col md-ref-col--left">
          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Instant Read</h2>
            <div className="md-ref-rows">
              <div className="md-ref-row">
                <span className="md-ref-k">Bias</span>
                <span className={biasValueClass(brief.instantRead?.bias || brief.marketPulse?.biasLabel)}>
                  {brief.instantRead?.bias || brief.marketPulse?.biasLabel || 'Neutral'}
                </span>
              </div>
              <div className="md-ref-row">
                <span className="md-ref-k">Conviction</span>
                <span className="md-ref-v">{brief.instantRead?.conviction || '—'}</span>
              </div>
              <div className="md-ref-row">
                <span className="md-ref-k">Trading Condition</span>
                <span className="md-ref-v">{brief.instantRead?.tradingCondition || brief.marketPulse?.marketState || '—'}</span>
              </div>
              <div className="md-ref-row md-ref-row--gold">
                <span className="md-ref-k">Best Approach</span>
                <span className="md-ref-v md-ref-v--gold">{brief.instantRead?.bestApproach || '—'}</span>
              </div>
            </div>
          </section>

          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Key Levels</h2>
            <div className="md-ref-rows">
              <div className="md-ref-row">
                <span className="md-ref-k">Resistance</span>
                <span className="md-ref-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.resistance1)}</span>
              </div>
              <div className="md-ref-row">
                <span className="md-ref-k">Support</span>
                <span className="md-ref-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.support1)}</span>
              </div>
            </div>
          </section>

          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Cross-Asset Context</h2>
            <div className="md-ref-cross-grid">
              {refCross.map((card) => (
                <div key={card.label} className={`md-ref-cross-tile md-ref-cross-tile--${card.tone}`}>
                  <span className={`md-ref-cross-ico md-ref-cross-ico--${card.icon}`} aria-hidden />
                  <span className="md-ref-cross-name">{card.label}</span>
                  <CrossArrow tone={card.tone} diag={card.icon === 'spy'} />
                </div>
              ))}
            </div>
          </section>
        </aside>

        <div className="md-ref-col md-ref-col--center">
          <section className="md-ref-panel md-ref-panel--chart">
            <div className="md-ref-chart-head">
              <span className="md-ref-pair">{formatPairLabel(brief.header.asset)}</span>
              <span className="md-ref-last">{formatLevel(brief.header.price, mt)}</span>
              <span
                className={
                  changePct != null && changePct >= 0
                    ? 'md-ref-pct md-ref-pct--up'
                    : changePct != null
                      ? 'md-ref-pct md-ref-pct--down'
                      : 'md-ref-pct'
                }
              >
                {formatPct(changePct) || 'Session snapshot pending'}
                {changePct != null ? (changePct >= 0 ? ' ▲' : ' ▼') : ''}
              </span>
            </div>
            <MarketDecoderChart bars={brief.meta?.chartBars} compact={false} referenceStyle />
          </section>

          <section className="md-ref-panel md-ref-panel--timeline">
            <h2 className="md-ref-panel-h">Event Risk</h2>
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

        <aside className="md-ref-col md-ref-col--right">
          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Market Pulse</h2>
            {brief.marketPulse ? (
              <>
                <div className="md-ref-gauge" aria-hidden>
                  <div className="md-ref-gauge-track">
                    <span className="md-ref-g-l md-ref-g-l--bear">Bearish</span>
                    <span className="md-ref-g-l md-ref-g-l--mid">Neutral</span>
                    <span className="md-ref-g-l md-ref-g-l--bull">Bullish</span>
                  </div>
                  <div
                    className="md-ref-g-needle"
                    style={{
                      transform: `rotate(${-90 + (Number(brief.marketPulse.gaugePosition ?? 50) / 100) * 180}deg)`,
                    }}
                  />
                </div>
                <p className="md-ref-pulse-caption">{pulseDeskLabel(brief)}</p>
              </>
            ) : (
              <p className="md-ref-muted">Pulse data not available.</p>
            )}
          </section>

          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Scenario Map</h2>
            <button type="button" className="md-ref-scen-row md-ref-scen-row--action" onClick={openScenarioDetails}>
              <span className="md-ref-scen-k">Upside Target</span>
              <span className="md-ref-scen-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.resistance1)}</span>
              <FiChevronRight className="md-ref-scen-chev" aria-hidden />
            </button>
            <button type="button" className="md-ref-scen-row md-ref-scen-row--action" onClick={openScenarioDetails}>
              <span className="md-ref-scen-k">Downside Risk</span>
              <span className="md-ref-scen-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.support1)}</span>
              <FiChevronRight className="md-ref-scen-chev" aria-hidden />
            </button>
          </section>

          <section className="md-ref-panel">
            <h2 className="md-ref-panel-h">Execution Guidance</h2>
            <ul className="md-ref-exec-list">
              {refChecklist.map((it, idx) => (
                <li key={it.title} className="md-ref-exec-item md-ref-exec-item--interactive">
                  <button
                    type="button"
                    className={`md-ref-exec-check-btn${execChecked[idx] ? ' md-ref-exec-check-btn--on' : ''}`}
                    aria-pressed={execChecked[idx]}
                    aria-label={`Toggle: ${it.title}`}
                    onClick={() => toggleExec(idx)}
                  />
                  <button type="button" className="md-ref-exec-hit" onClick={() => toggleExec(idx)}>
                    <span className="md-ref-exec-body">
                      <span className="md-ref-exec-title">{it.title}</span>
                      <span className="md-ref-exec-sub">{it.sub}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <footer className="md-ref-footer">
        <span className="md-ref-footer-cap">
          {String(brief.finalOutput?.currentPosture || 'WAIT FOR CONFIRMATION').toUpperCase()}
        </span>
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
            <h3 className="md-ref-subh">Headlines · {brief.header.asset}</h3>
            {instrumentHeadlines.length > 0 ? (
              <>
                <p className="md-meets-scope md-decoder-small">
                  {headlinePack.scope === 'none'
                    ? 'No headlines returned for this decode.'
                    : showingFallbackHeadlines
                      ? `Broader macro context from ${headlinePack.total} headlines.`
                      : `${instrumentHeadlines.length} headlines ranked for ${brief.header.asset}.`}
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
    </>
  );
}
