import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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

function MiniSparkline({ values }) {
  if (!values || values.length < 2) return null;
  const w = 200;
  const h = 48;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="md-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke="rgba(212,175,55,0.85)" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function biasPillClass(bias) {
  const b = (bias || '').toLowerCase();
  if (b === 'bullish') return 'md-decoder-pill md-decoder-pill--bull';
  if (b === 'bearish') return 'md-decoder-pill md-decoder-pill--bear';
  return 'md-decoder-pill md-decoder-pill--neutral';
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

function postureToneClass(posture) {
  const text = String(posture || '').toLowerCase();
  if (text.includes('bull')) return 'md-tone md-tone--bull';
  if (text.includes('bear')) return 'md-tone md-tone--bear';
  if (text.includes('wait') || text.includes('neutral') || text.includes('stand')) return 'md-tone md-tone--neutral';
  return 'md-tone';
}

function readinessToneClass(readiness) {
  const n = Number(readiness);
  if (Number.isNaN(n)) return 'md-readiness-tone md-readiness-tone--mid';
  if (n >= 7) return 'md-readiness-tone md-readiness-tone--high';
  if (n >= 5) return 'md-readiness-tone md-readiness-tone--mid';
  return 'md-readiness-tone md-readiness-tone--low';
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

export default function MarketDecoderView({ embedded }) {
  const [q, setQ] = useState('EURUSD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  /** Symbol for the brief currently on screen (not the input draft). */
  const [activeSymbol, setActiveSymbol] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  /** Wider spacing and full hero copy when true; default is compact desk layout. */
  const [comfortableLayout, setComfortableLayout] = useState(false);
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

  const onSubmit = (e) => {
    e.preventDefault();
    run(q, true);
  };

  const mt = brief?.header?.marketType || 'FX';

  const instrumentHeadlines = headlinePack.items;
  const showingFallbackHeadlines = headlinePack.scope === 'fallback' || headlinePack.scope === 'none';
  const netScore = Number(brief?.meta?.netScore ?? 0);
  const netScorePct = Math.max(0, Math.min(100, Math.round(((netScore + 6) / 12) * 100)));
  const tradeReadiness = Number(brief?.marketPulse?.tradeReadiness ?? 0);

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
    <div
      className={`md-decoder ${embedded ? 'md-decoder--embedded' : ''} ${previewMode ? 'md-decoder--preview' : ''} ${
        comfortableLayout ? 'md-decoder--comfortable' : 'md-decoder--compact'
      }`}
    >
      <header className="md-decoder-hero">
        <div className="md-decoder-hero-compact">
          <div className="md-decoder-hero-brand">
            <p className="md-decoder-hero-eyebrow">Aura Terminal</p>
            <h2 className="md-decoder-hero-title">Market Decoder</h2>
          </div>
          <form className="md-decoder-search md-decoder-search--toolbar" onSubmit={onSubmit} autoComplete="off">
            <input
              className="md-decoder-input"
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase())}
              placeholder="Symbol (e.g. EURUSD, XAUUSD, BTCUSD, SPY)"
              aria-label="Asset symbol"
            />
            <button type="submit" className="md-decoder-submit" disabled={loading}>
              {loading ? 'Decoding…' : 'Decode'}
            </button>
          </form>
        </div>
        {comfortableLayout && (
          <p className="md-decoder-hero-sub md-decoder-hero-sub--block">
            Rules-first desk brief per asset: bias, levels, scenarios, and execution context in one view.
          </p>
        )}
        <div className="md-decoder-chips" role="group" aria-label="Quick symbols">
          {QUICK.map((s) => (
            <button key={s} type="button" className="md-decoder-chip" onClick={() => { setQ(s); run(s, true); }}>
              {s}
            </button>
          ))}
        </div>
        <details className="md-decoder-details md-decoder-details--hero">
          <summary className="md-decoder-details-summary">How to use · what this is</summary>
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

        {cached && brief && (
          <p className="md-decoder-meta">Served from cache — decode again for a fresh pull.</p>
        )}
        {brief && (
          <p className="md-decoder-live" role="status">
            <span className="md-decoder-live-dot" aria-hidden />
            Live refresh every {Math.round(LIVE_POLL_MS / 1000)}s
            {formatGeneratedAt(brief.meta?.generatedAt) ? (
              <span className="md-decoder-live-time"> · Last updated {formatGeneratedAt(brief.meta.generatedAt)}</span>
            ) : null}
            {liveRefreshing ? <span className="md-decoder-live-sync"> · Updating…</span> : null}
          </p>
        )}
        {brief && (
          <div className="md-decoder-actions">
            <button type="button" className="md-decoder-action-btn" onClick={() => setComfortableLayout((v) => !v)}>
              {comfortableLayout ? 'Compact layout' : 'Comfortable layout'}
            </button>
            <button type="button" className="md-decoder-action-btn" onClick={() => setPreviewMode((v) => !v)}>
              {previewMode ? 'Standard View' : 'Preview Style'}
            </button>
            <button type="button" className="md-decoder-action-btn" onClick={exportPreviewPdf}>
              Export PDF
            </button>
            <button type="button" className="md-decoder-action-btn" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="md-decoder-error" role="alert">
          {error}
        </div>
      )}

      {brief && (
        <div className="md-decoder-stack">
          <section className="md-decoder-executive" aria-label="Brief at a glance">
            <div className="md-decoder-executive-kpis">
              <div className="md-exec-kpi">
                <span className="md-summary-label">Bias</span>
                <span className={biasPillClass(brief.instantRead?.bias || brief.marketPulse?.biasLabel)}>
                  {brief.instantRead?.bias || brief.marketPulse?.biasLabel || 'Neutral'}
                </span>
              </div>
              <div className="md-exec-kpi">
                <span className="md-summary-label">Conviction</span>
                <strong className="md-exec-kpi-val">{brief.instantRead?.conviction || '—'}</strong>
              </div>
              <div className="md-exec-kpi">
                <span className="md-summary-label">Condition</span>
                <strong className="md-exec-kpi-val">{brief.instantRead?.tradingCondition || brief.marketPulse?.marketState || '—'}</strong>
              </div>
              <div className="md-exec-kpi">
                <span className="md-summary-label">Readiness</span>
                <strong className="md-exec-kpi-val">{brief.marketPulse?.tradeReadiness != null ? `${brief.marketPulse.tradeReadiness}/10` : '—'}</strong>
              </div>
            </div>
            <div className="md-decoder-executive-body">
              <div className="md-decoder-executive-main">
                <span className="md-exec-lead-label">Desk posture</span>
                <strong className={`md-exec-posture ${postureToneClass(brief.finalOutput?.currentPosture)}`}>
                  {brief.finalOutput?.currentPosture || 'No posture yet'}
                </strong>
                <p className="md-exec-posture-sub">
                  {brief.finalOutput?.postureSubtitle || brief.instantRead?.bestApproach || 'Wait for cleaner structure before sizing.'}
                </p>
              </div>
              <div className="md-decoder-executive-aside">
                <p className="md-exec-aside-line">
                  <strong>Approach:</strong> {brief.instantRead?.bestApproach || '—'}
                </p>
                <p className="md-exec-aside-line md-exec-aside-line--muted">
                  <strong>What would change this:</strong>{' '}
                  {brief.finalOutput?.whatWouldChangeThis || 'Break of structure, catalyst, or invalidation at key levels.'}
                </p>
              </div>
            </div>
            <div className="md-executive-impact-grid">
              <div className="md-impact-card">
                <span className="md-impact-label">Signal Strength</span>
                <strong className="md-impact-value">
                  {netScore >= 0 ? '+' : ''}
                  {netScore} net
                </strong>
                <div className="md-impact-meter" aria-hidden>
                  <span className="md-impact-meter-fill" style={{ width: `${netScorePct}%` }} />
                </div>
              </div>
              <div className="md-impact-card">
                <span className="md-impact-label">Trade Readiness</span>
                <strong className={`md-impact-value ${readinessToneClass(tradeReadiness)}`}>
                  {brief.marketPulse?.tradeReadiness != null ? `${brief.marketPulse.tradeReadiness}/10` : '—'}
                </strong>
                <p className="md-impact-note">{brief.marketPulse?.environmentLine || 'Environment not available yet.'}</p>
              </div>
              <div className="md-impact-card">
                <span className="md-impact-label">Immediate Focus</span>
                <strong className="md-impact-value md-impact-value--small">{brief.instantRead?.bestApproach || '—'}</strong>
              </div>
            </div>
          </section>

          {instrumentHeadlines.length > 0 && (
            <section className="md-decoder-headline-strip" aria-label="Top headlines">
              <div className="md-decoder-card-head">
                <div>
                  <h3 className="md-decoder-card-title md-terminal-title">Top Headlines · {brief.header.asset}</h3>
                  <p className="md-decoder-small">
                    {headlinePack.scope === 'none'
                      ? 'No headlines returned for this decode.'
                      : showingFallbackHeadlines
                        ? `Showing broader macro context from ${headlinePack.total} headlines.`
                        : `Showing ${Math.min(3, instrumentHeadlines.length)} strongest instrument-relevant headlines.`}
                  </p>
                </div>
              </div>
              <div className="md-headline-strip-grid">
                {instrumentHeadlines.slice(0, 3).map((item, i) => {
                  const href = String(item.url || '').trim();
                  const safe = href && href !== '#';
                  return (
                    <article key={`${href}-${i}`} className="md-headline-card">
                      {safe ? (
                        <a className="md-headline-card-link" href={href} target="_blank" rel="noopener noreferrer">
                          {item.title || 'Open article'}
                        </a>
                      ) : (
                        <span className="md-headline-card-title">{item.title || 'Headline'}</span>
                      )}
                      <div className="md-headline-card-meta">
                        {item.source ? <span>{item.source}</span> : null}
                        {item.datetime ? <span>{formatNewsTime(item.datetime)}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="md-decoder-top-grid md-terminal-split">
            <section className="md-decoder-card md-terminal-instrument" aria-labelledby="md-h-header">
              <h3 id="md-h-header" className="md-decoder-card-title md-terminal-title">
                Instrument
              </h3>
              <div className="md-terminal-headline">
                <span className="md-terminal-symbol">{brief.header.asset}</span>
                <span className="md-terminal-type">{brief.header.marketType}</span>
              </div>
              <div className="md-terminal-price-row">
                <div>
                  <span className="md-terminal-eyebrow">Last</span>
                  <span className="md-terminal-price">{formatLevel(brief.header.price, mt)}</span>
                </div>
                <div>
                  <span className="md-terminal-eyebrow">Session</span>
                  <span className={`md-terminal-chg ${brief.header.changePercent >= 0 ? 'md-terminal-chg--up' : 'md-terminal-chg--down'}`}>
                    {formatPct(brief.header.changePercent)}
                  </span>
                </div>
              </div>
              {brief.header.whatChanged && (
                <p className="md-terminal-what-changed">{brief.header.whatChanged}</p>
              )}
              {brief.meta?.sparkline?.length > 2 && (
                <div className="md-terminal-spark-wrap">
                  <span className="md-terminal-eyebrow">Recent closes (last {brief.meta.sparkline.length})</span>
                  <MiniSparkline values={brief.meta.sparkline} />
                </div>
              )}
            </section>

            {brief.marketPulse && (
              <section className="md-decoder-card md-decoder-card--pulse md-terminal-pulse" aria-labelledby="md-h-pulse">
                <h3 id="md-h-pulse" className="md-decoder-card-title md-terminal-title">
                  Market pulse
                </h3>
                <div className="md-pulse-gauge-wrap">
                  <div className="md-pulse-gauge" aria-hidden>
                    <div className="md-pulse-gauge-track">
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--bear">Bearish</span>
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--mid">Neutral</span>
                      <span className="md-pulse-gauge-label md-pulse-gauge-label--bull">Bullish</span>
                    </div>
                    <div
                      className="md-pulse-needle"
                      style={{
                        transform: `rotate(${-90 + (Number(brief.marketPulse.gaugePosition) / 100) * 180}deg)`,
                      }}
                    />
                  </div>
                  <p className="md-pulse-bias-line">
                    Bias: <strong>{brief.marketPulse.biasLabel}</strong>
                  </p>
                </div>
                {brief.marketPulse.convictionExplanation && (
                  <p className="md-pulse-conviction">{brief.marketPulse.convictionExplanation}</p>
                )}
                <ul className="md-pulse-stats">
                  <li>
                    <span className="md-pulse-stat-label">Momentum</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.momentum}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Volatility</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.volatility}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Market state</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.marketState}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Decision pressure</span>
                    <span className="md-pulse-stat-val">{brief.marketPulse.decisionPressure}</span>
                  </li>
                  <li>
                    <span className="md-pulse-stat-label">Trade readiness</span>
                    <span className="md-pulse-stat-val md-pulse-stat-val--gold">
                      {brief.marketPulse.tradeReadiness} / 10
                    </span>
                  </li>
                </ul>
                {brief.marketPulse.environmentLine && (
                  <p className="md-pulse-environment">{brief.marketPulse.environmentLine}</p>
                )}
              </section>
            )}
          </div>

          <section className="md-decoder-card md-decoder-card--chart" aria-labelledby="md-h-chart">
            <div className="md-decoder-card-head">
              <div>
                <h3 id="md-h-chart" className="md-decoder-card-title md-terminal-title">
                  Price action
                </h3>
                <p className="md-chart-lede md-decoder-small">
                  Daily OHLC aligned with this brief, with quick mode switching so the market structure is easier to read.
                </p>
              </div>
              <span className="md-chart-badge">Aligned with brief</span>
            </div>
            <MarketDecoderChart bars={brief.meta?.chartBars} compact={!comfortableLayout} />
          </section>

          <div className="md-decoder-workspace">
            <div className="md-decoder-primary">
              <section className="md-decoder-card" aria-labelledby="md-h-wmn">
                <h3 id="md-h-wmn" className="md-decoder-card-title">
                  What matters now
                </h3>
                <ul className="md-decoder-bullets">
                  {(brief.whatMattersNow || []).map((item) => (
                    <li key={item.label}>
                      <strong>{item.label}:</strong> {item.text}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="md-decoder-card md-levels-card" aria-labelledby="md-h-levels">
                <div className="md-decoder-card-head">
                  <div>
                    <h3 id="md-h-levels" className="md-decoder-card-title">
                      Key levels
                    </h3>
                    <p className="md-decoder-small md-card-caption">Important reference points for reaction, continuation, and invalidation.</p>
                  </div>
                </div>
                <div className="md-levels-grid">
                  {brief.keyLevels?.keyLevelsDisplay ? (
                    [
                      ['resistance1', 'Resistance 1'],
                      ['resistance2', 'Resistance 2'],
                      ['support1', 'Support 1'],
                      ['support2', 'Support 2'],
                      ['previousDayHigh', 'Prior session high'],
                      ['previousDayLow', 'Prior session low'],
                      ['weeklyHigh', 'Weekly high'],
                      ['weeklyLow', 'Weekly low'],
                    ].map(([key, label]) => (
                      <div key={key} className="md-level-line">
                        <span className="md-level-label">{label}</span>
                        <span className="md-level-val">{brief.keyLevels.keyLevelsDisplay[key]}</span>
                      </div>
                    ))
                  ) : (
                    <p className="md-level-fallback">Level grid loading from server…</p>
                  )}
                </div>
              </section>

              <details className="md-decoder-details md-decoder-details--panel">
                <summary className="md-decoder-details-summary md-decoder-details-summary--panel">Scenario map</summary>
                <section className="md-decoder-card md-decoder-card--details-inner" aria-labelledby="md-h-scen">
                  <div className="md-decoder-card-head">
                    <div>
                      <h3 id="md-h-scen" className="md-decoder-card-title">
                        Scenario map
                      </h3>
                      <p className="md-decoder-small md-card-caption">If price confirms or fails each branch, the next step should be obvious.</p>
                    </div>
                  </div>
                  <div className="md-decoder-scenario">
                    <div className="md-decoder-scenario-block">
                      <div className="md-decoder-scenario-label md-decoder-scenario-label--bull">Bullish scenario</div>
                      <p className="md-decoder-small" style={{ marginTop: 0 }}>
                        <strong>Condition:</strong> {brief.scenarioMap.bullish.condition}
                      </p>
                      <p className="md-decoder-small">
                        <strong>Outcome:</strong> {brief.scenarioMap.bullish.outcome}
                      </p>
                    </div>
                    <div className="md-decoder-scenario-block">
                      <div className="md-decoder-scenario-label md-decoder-scenario-label--bear">Bearish scenario</div>
                      <p className="md-decoder-small" style={{ marginTop: 0 }}>
                        <strong>Condition:</strong> {brief.scenarioMap.bearish.condition}
                      </p>
                      <p className="md-decoder-small">
                        <strong>Outcome:</strong> {brief.scenarioMap.bearish.outcome}
                      </p>
                    </div>
                    <div className="md-decoder-scenario-block">
                      <div className="md-decoder-scenario-label md-decoder-scenario-label--flat">No-trade scenario</div>
                      <p className="md-decoder-small" style={{ marginTop: 0 }}>
                        {brief.scenarioMap.noTrade.when}
                      </p>
                    </div>
                  </div>
                </section>
              </details>

              <details className="md-decoder-details md-decoder-details--panel">
                <summary className="md-decoder-details-summary md-decoder-details-summary--panel">Execution guidance</summary>
                <section className="md-decoder-card md-decoder-card--execution md-decoder-card--details-inner" aria-labelledby="md-h-ex">
                  <div className="md-decoder-card-head">
                    <div>
                      <h3 id="md-h-ex" className="md-decoder-card-title">
                        Execution guidance
                      </h3>
                      <p className="md-decoder-small md-card-caption">Final filter — not a shortcut to force a trade.</p>
                    </div>
                  </div>
                  {(brief.executionGuidance || brief.executionNote) && (
                    <div className="md-exec-grid">
                      <div className="md-exec-row">
                        <span className="md-exec-key">Preferred direction</span>
                        <span className="md-exec-val">
                          → {brief.executionGuidance?.preferredDirection ?? brief.executionNote?.preferredDirection}
                        </span>
                      </div>
                      <div className="md-exec-row">
                        <span className="md-exec-key">Entry condition</span>
                        <span className="md-exec-val">
                          → {brief.executionGuidance?.entryCondition ?? brief.executionNote?.confirmationNeeded}
                        </span>
                      </div>
                      <div className="md-exec-row">
                        <span className="md-exec-key">Invalidation</span>
                        <span className="md-exec-val">
                          → {brief.executionGuidance?.invalidation ?? brief.executionNote?.invalidation}
                        </span>
                      </div>
                      <div className="md-exec-row">
                        <span className="md-exec-key">Risk consideration</span>
                        <span className="md-exec-val">
                          → {brief.executionGuidance?.riskConsideration ?? '—'}
                        </span>
                      </div>
                      <div className="md-exec-row md-exec-row--avoid">
                        <span className="md-exec-key">Avoid this</span>
                        <span className="md-exec-val">
                          → {brief.executionGuidance?.avoidThis ?? brief.executionNote?.whatNotToDo}
                        </span>
                      </div>
                    </div>
                  )}
                </section>
              </details>
            </div>

            <aside className="md-decoder-rail">
              <section className="md-decoder-card md-decoder-card--posture" aria-labelledby="md-h-posture">
                <h3 id="md-h-posture" className="md-decoder-card-title">
                  Final output
                </h3>
                <p className="md-decoder-posture-label">Current posture</p>
                <p className={`md-decoder-posture-value ${postureToneClass(brief.finalOutput.currentPosture)}`}>
                  {brief.finalOutput.currentPosture}
                </p>
                {brief.finalOutput.postureSubtitle && (
                  <p className="md-decoder-posture-sub">→ {brief.finalOutput.postureSubtitle}</p>
                )}
                <div className="md-decoder-posture-detail">
                  <p className="md-decoder-posture-detail-key">Reason</p>
                  <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.reason ?? '—'}</p>
                  <p className="md-decoder-posture-detail-key">What would change this</p>
                  <p className="md-decoder-posture-detail-val">→ {brief.finalOutput.whatWouldChangeThis ?? '—'}</p>
                </div>
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-ev">
                <h3 id="md-h-ev" className="md-decoder-card-title">
                  Event risk
                </h3>
                {(brief.eventRisk || []).length === 0 ? (
                  <p className="md-decoder-small">No high-priority events parsed from calendar for this view.</p>
                ) : (
                  <ul className="md-decoder-line-list">
                    {brief.eventRisk.map((ev, i) => (
                      <li key={i}>
                        <strong>{ev.title}</strong>
                        {ev.timeUntil ? ` — ${ev.timeUntil}` : ''} · Impact: {ev.impact}
                        {ev.note ? <span className="md-ev-note"> {ev.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="md-decoder-card md-decoder-card--meets" aria-labelledby="md-h-meets">
                <h3 id="md-h-meets" className="md-decoder-card-title md-terminal-title">
                  Market meetings · {brief.header.asset}
                </h3>
                <p className="md-meets-scope md-decoder-small">
                  {brief.meta?.marketMeetingsScope === 'pair' &&
                    'Economic releases filtered to currencies linked to this instrument.'}
                  {brief.meta?.marketMeetingsScope === 'global' &&
                    'Pair-specific calendar rows were thin — showing the broader macro window for the same dates.'}
                  {brief.meta?.marketMeetingsScope === 'none' &&
                    'Economic calendar did not return rows for this window.'}
                  {!['pair', 'global', 'none'].includes(brief.meta?.marketMeetingsScope) &&
                    'Macro calendar context for upcoming releases.'}
                </p>
                {Array.isArray(brief.meta?.marketMeetings) && brief.meta.marketMeetings.length > 0 ? (
                  <ul className="md-meets-list">
                    {brief.meta.marketMeetings.map((ev, i) => (
                      <li key={`${ev.title}-${i}`}>
                        <strong>{ev.title}</strong>
                        {ev.timeUntil ? ` — ${ev.timeUntil}` : ''}
                        {ev.impact ? (
                          <span className={`md-meets-impact md-meets-impact--${String(ev.impact).toLowerCase()}`}>
                            {' '}
                            · {ev.impact}
                          </span>
                        ) : null}
                        {ev.date ? <span className="md-meets-date"> · {ev.date}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="md-decoder-small">No upcoming releases parsed for this view.</p>
                )}
              </section>

              <section className="md-decoder-card" aria-labelledby="md-h-news">
                <h3 id="md-h-news" className="md-decoder-card-title md-terminal-title">
                  Headlines · {brief.header.asset}
                </h3>
                {instrumentHeadlines.length > 0 ? (
                  <>
                    <p className="md-meets-scope md-decoder-small">
                      {headlinePack.scope === 'none'
                        ? 'No headlines returned for this decode.'
                        : showingFallbackHeadlines
                          ? `No strong ${brief.header.asset} match in ${headlinePack.total} headlines — showing broader macro items.`
                          : `${instrumentHeadlines.length} headlines ranked for ${brief.header.asset}.`}
                    </p>
                  <ul className="md-anchor-news-list">
                    {instrumentHeadlines.map((item, i) => {
                      const href = String(item.url || '').trim();
                      const safe = href && href !== '#';
                      return (
                        <li key={`${href}-${i}`}>
                          {safe ? (
                            <a
                              className="md-anchor-news-link"
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {item.title || 'Open article'}
                            </a>
                          ) : (
                            <span className="md-anchor-news-title">{item.title || 'Headline'}</span>
                          )}
                          <div className="md-anchor-news-meta">
                            {item.source ? <span>{item.source}</span> : null}
                            {item.datetime ? (
                              <span className="md-anchor-news-time">{formatNewsTime(item.datetime)}</span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  </>
                ) : (
                  <p className="md-decoder-small">
                    No headlines matched this symbol with the configured keys.
                  </p>
                )}
              </section>

              <details className="md-decoder-details md-decoder-details--panel">
                <summary className="md-decoder-details-summary md-decoder-details-summary--panel">Cross-asset · positioning</summary>
                <div className="md-decoder-card md-decoder-card--details-inner md-decoder-stack-nested">
                  <section aria-labelledby="md-h-cross">
                    <h3 id="md-h-cross" className="md-decoder-card-title">
                      Cross-asset context
                    </h3>
                    <ul className="md-decoder-line-list">
                      {(brief.crossAssetContext || []).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </section>
                  <section aria-labelledby="md-h-pos">
                    <h3 id="md-h-pos" className="md-decoder-card-title">
                      Positioning
                    </h3>
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
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
