import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FiSearch, FiMic, FiChevronRight, FiArrowUpRight, FiArrowDownRight } from 'react-icons/fi';
import Api from '../../services/Api';
import MarketDecoderChart from './MarketDecoderChart';
import '../../styles/trader-deck/MarketDecoder.css';

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];
/** Background refresh interval while a brief is shown (server still enforces MARKET_DECODER_CACHE_SEC unless refresh=1). */
const LIVE_POLL_MS = Math.max(15000, parseInt(process.env.REACT_APP_MARKET_DECODER_POLL_MS || '30000', 10) || 30000);

function formatGeneratedAt(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(11, 19);
  }
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) {
    return 'Session % pending — quote snapshot incomplete';
  }
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function formatLevel(v, marketType) {
  if (v == null || Number.isNaN(Number(v))) {
    return 'Not available from loaded series';
  }
  const n = Number(v);
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

const DECODER_FLOW = [
  {
    step: '1',
    title: 'Read the brief',
    note: 'Start with bias, conviction, and current posture.',
  },
  {
    step: '2',
    title: 'Inspect structure',
    note: 'Use price action, levels, and scenario map.',
  },
  {
    step: '3',
    title: 'Check risk context',
    note: 'Review macro calendar, headlines, and positioning.',
  },
  {
    step: '4',
    title: 'Decide execution',
    note: 'Only act if the posture and trigger still align.',
  },
];

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

export default function MarketDecoderView({ embedded }) {
  const [q, setQ] = useState('EURUSD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  /** Symbol for the brief currently on screen (not the input draft). */
  const [activeSymbol, setActiveSymbol] = useState(null);
  const activeSymbolRef = useRef(null);
  activeSymbolRef.current = activeSymbol;

  const run = useCallback(async (symbol, refresh = false, silent = false) => {
    const sym = String(symbol || '').trim();
    if (!sym) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    } else {
      setLiveRefreshing(true);
    }
    try {
      const res = await Api.getTraderDeckMarketDecoder(sym, { refresh });
      const data = res.data;
      if (!data.success) {
        if (!silent) {
          const msg = data.message || 'Could not decode this symbol.';
          const code = data.code ? `${data.code}: ` : '';
          setError(`${code}${msg}`);
          setBrief(null);
        }
        return;
      }
      setBrief(data.brief);
      setCached(Boolean(data.cached));
      setActiveSymbol(sym);
    } catch (e) {
      if (!silent) {
        const d = e?.response?.data;
        const code = d?.code ? `${d.code}: ` : '';
        setError(`${code}${d?.message || e.message || 'Request failed'}`);
        setBrief(null);
      }
    } finally {
      if (!silent) setLoading(false);
      else setLiveRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!brief || !activeSymbol) return undefined;
    const id = setInterval(() => {
      const sym = activeSymbolRef.current;
      if (sym) run(sym, true, true);
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [brief, activeSymbol, run]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const sym = activeSymbolRef.current;
      if (sym && brief) run(sym, true, true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [brief, run]);

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

  const onSubmit = (e) => {
    e.preventDefault();
    run(q, true);
  };

  const mt = brief?.header?.marketType || 'FX';

  const instrumentHeadlines = headlinePack.items;
  const showingFallbackHeadlines = headlinePack.scope === 'fallback' || headlinePack.scope === 'none';

  const exportJson = useCallback(() => {
    if (!brief) return;
    try {
      const blob = new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const symbol = (brief?.header?.asset || q || 'market').toString().toUpperCase();
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `market-decoder-${symbol}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, [brief, q]);

  const exportPreviewPdf = useCallback(() => {
    if (!brief) return;
    const symbol = (brief?.header?.asset || q || 'Market').toString().toUpperCase();
    const generatedAt = formatGeneratedAt(brief?.meta?.generatedAt) || '—';
    const posture = escapeHtml(brief?.finalOutput?.currentPosture || 'No posture yet');
    const sub = escapeHtml(brief?.finalOutput?.postureSubtitle || brief?.instantRead?.bestApproach || '');
    const bias = escapeHtml(brief?.instantRead?.bias || 'Neutral');
    const conv = escapeHtml(brief?.instantRead?.conviction || '—');
    const wmn = (brief?.whatMattersNow || [])
      .map((x) => `<li><strong>${escapeHtml(x.label)}:</strong> ${escapeHtml(x.text)}</li>`)
      .join('');
    const pref = escapeHtml(brief?.executionGuidance?.preferredDirection || '—');
    const ent = escapeHtml(brief?.executionGuidance?.entryCondition || '—');
    const inv = escapeHtml(brief?.executionGuidance?.invalidation || '—');
    const avoid = escapeHtml(brief?.executionGuidance?.avoidThis || '—');
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Market Decoder ${escapeHtml(symbol)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            .meta { margin-bottom: 16px; color: #444; font-size: 12px; }
            .row { margin-bottom: 12px; }
            .label { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
            ul { margin: 6px 0 0; padding-left: 18px; }
          </style>
        </head>
        <body>
          <h1>Market Decoder Preview · ${escapeHtml(symbol)}</h1>
          <div class="meta">Generated: ${escapeHtml(generatedAt)}</div>
          <div class="card">
            <div class="label">Current posture</div>
            <strong>${posture}</strong>
            <div class="row">${sub}</div>
          </div>
          <div class="card">
            <div class="label">Bias & conviction</div>
            <div>${bias} · ${conv}</div>
          </div>
          <div class="card">
            <div class="label">What matters now</div>
            <ul>${wmn}</ul>
          </div>
          <div class="card">
            <div class="label">Execution guidance</div>
            <ul>
              <li><strong>Preferred direction:</strong> ${pref}</li>
              <li><strong>Entry condition:</strong> ${ent}</li>
              <li><strong>Invalidation:</strong> ${inv}</li>
              <li><strong>Avoid:</strong> ${avoid}</li>
            </ul>
          </div>
        </body>
      </html>
    `;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 120);
  }, [brief, q]);

  return (
    <div className={`md-decoder md-decoder--reference ${embedded ? 'md-decoder--embedded' : ''}`}>
      <header className="md-ref-top">
        <p className="md-ref-aura">Aura Terminal</p>
        <h1 className="md-ref-title">Market Decoder</h1>
        <form className="md-ref-search" onSubmit={onSubmit} autoComplete="off">
          <FiSearch className="md-ref-search-ico" aria-hidden />
          <input
            className="md-ref-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            placeholder="Decode any market"
            aria-label="Asset symbol"
          />
          <button type="button" className="md-ref-mic" aria-label="Voice search">
            <FiMic aria-hidden />
          </button>
          <button type="submit" className="md-ref-decode" disabled={loading}>
            {loading ? '…' : 'Decode'}
          </button>
        </form>
        <div className="md-ref-chips" role="group" aria-label="Quick symbols">
          {QUICK.map((s) => (
            <button key={s} type="button" className="md-ref-chip" onClick={() => { setQ(s); run(s, true); }}>
              {s}
            </button>
          ))}
        </div>
        <div className="md-ref-meta-row">
          {cached && brief ? <span className="md-ref-cache-note">Cached brief — decode again to refresh</span> : null}
          {brief ? (
            <span className="md-ref-live" role="status">
              <span className="md-ref-live-dot" aria-hidden />
              Live ~{Math.round(LIVE_POLL_MS / 1000)}s
              {formatGeneratedAt(brief.meta?.generatedAt) ? ` · ${formatGeneratedAt(brief.meta.generatedAt)}` : ''}
              {liveRefreshing ? ' · Updating' : ''}
            </span>
          ) : null}
          <span className="md-ref-export-slot">
            {brief ? (
              <>
                <button type="button" className="md-ref-link-btn" onClick={exportPreviewPdf}>
                  Export PDF
                </button>
                <button type="button" className="md-ref-link-btn" onClick={exportJson}>
                  Export JSON
                </button>
              </>
            ) : null}
          </span>
        </div>
        <details className="md-ref-details-help">
          <summary className="md-ref-details-sum">How to use · what this is</summary>
          <div className="md-decoder-hero-grid md-decoder-hero-grid--nested">
            <div className="md-decoder-flow" aria-label="Decoder workflow">
              {DECODER_FLOW.map((item) => (
                <div key={item.step} className="md-decoder-flow-step">
                  <span className="md-decoder-flow-index">{item.step}</span>
                  <span className="md-decoder-flow-copy">
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </span>
                </div>
              ))}
            </div>
            <aside className="md-decoder-hero-rail">
              <div className="md-hero-rail-card">
                <span className="md-hero-rail-label">What this is</span>
                <strong>One pre-trade brief — context and filters, not a signal feed.</strong>
              </div>
              <div className="md-hero-rail-card">
                <span className="md-hero-rail-label">Best use</span>
                <strong>Read posture and risks first; execute only when your trigger still aligns.</strong>
              </div>
            </aside>
          </div>
        </details>
      </header>

      {error ? <div className="md-decoder-error" role="alert">{error}</div> : null}

      {brief ? (
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
                      brief.header.changePercent != null &&
                      !Number.isNaN(Number(brief.header.changePercent)) &&
                      Number(brief.header.changePercent) >= 0
                        ? 'md-ref-pct md-ref-pct--up'
                        : 'md-ref-pct md-ref-pct--down'
                    }
                  >
                    {formatPct(brief.header.changePercent)}
                    {brief.header.changePercent != null &&
                    !Number.isNaN(Number(brief.header.changePercent)) &&
                    Number(brief.header.changePercent) >= 0 ? (
                      ' ▲'
                    ) : (
                      ' ▼'
                    )}
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
                <button type="button" className="md-ref-scen-row">
                  <span className="md-ref-scen-k">Upside Target</span>
                  <span className="md-ref-scen-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.resistance1)}</span>
                  <FiChevronRight className="md-ref-scen-chev" aria-hidden />
                </button>
                <button type="button" className="md-ref-scen-row">
                  <span className="md-ref-scen-k">Downside Risk</span>
                  <span className="md-ref-scen-v">{levelShort(brief.keyLevels?.keyLevelsDisplay?.support1)}</span>
                  <FiChevronRight className="md-ref-scen-chev" aria-hidden />
                </button>
              </section>

              <section className="md-ref-panel">
                <h2 className="md-ref-panel-h">Execution Guidance</h2>
                <ul className="md-ref-exec-list">
                  {refChecklist.map((it) => (
                    <li key={it.title} className="md-ref-exec-item">
                      <span className="md-ref-exec-check" aria-hidden />
                      <span className="md-ref-exec-body">
                        <span className="md-ref-exec-title">{it.title}</span>
                        <span className="md-ref-exec-sub">{it.sub}</span>
                      </span>
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

          <details className="md-ref-more">
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
                <section className="md-ref-panel md-ref-panel--flat">
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
      ) : (
        <div className="md-ref-placeholder">
          <p className="md-ref-placeholder-msg">Decode a symbol to load the desk.</p>
        </div>
      )}
    </div>
  );
}
