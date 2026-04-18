import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiMic } from 'react-icons/fi';
import { FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import CosmicBackground from '../../components/CosmicBackground';
import MarketDecoderBriefContent from './MarketDecoderBriefContent';
import { MARKET_DECODER_LAB_HANDOFF_KEY } from '../../lib/aura-analysis/validator/validatorChecklistStorage';
import { formatPairLabel } from '../../lib/market/formatPairLabel';
import '../../styles/trader-deck/MarketIntelligenceBriefPreview.css';
import '../../styles/trader-deck/MarketDecoder.css';
import { sanitizeTraderDeskPayloadDeep } from '../../utils/sanitizeAiDeskOutput.react.js';

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DECODER_FLOW = [
  { step: '1', title: 'Read the brief', note: 'Start with bias, conviction, and current posture.' },
  { step: '2', title: 'Inspect structure', note: 'Use price action, levels, and scenario map.' },
  { step: '3', title: 'Check risk context', note: 'Review macro calendar, headlines, and positioning.' },
  { step: '4', title: 'Decide execution', note: 'Only act if the posture and trigger still align.' },
];

export default function MarketDecoderView({ embedded }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('EURUSD');
  const [quickChips, setQuickChips] = useState(QUICK);
  const [suggestions, setSuggestions] = useState([]);
  const suggestTimerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);
  const [cacheSnapshot, setCacheSnapshot] = useState({ ageSec: null, ttlSec: null });
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
        setCached(false);
        setCacheSnapshot({ ageSec: null, ttlSec: null });
        if (!silent) {
          const msg = data.message || 'Could not decode this symbol.';
          const code = data.code ? `${data.code}: ` : '';
          setError(`${code}${msg}`);
          setBrief(null);
          setPreviewOpen(false);
        }
        return;
      }
      setBrief(data.brief ? sanitizeTraderDeskPayloadDeep(data.brief) : null);
      setCached(Boolean(data.cached));
      setCacheSnapshot({
        ageSec: typeof data.cacheAgeSec === 'number' ? data.cacheAgeSec : null,
        ttlSec: typeof data.cacheTtlSec === 'number' ? data.cacheTtlSec : null,
      });
      const canon = data.brief?.instrument?.canonical || data.brief?.meta?.canonicalSymbol;
      setActiveSymbol(canon || String(sym).trim().toUpperCase());
      if (!silent) {
        setPreviewOpen(true);
      }
    } catch (e) {
      setCached(false);
      setCacheSnapshot({ ageSec: null, ttlSec: null });
      if (!silent) {
        const d = e?.response?.data;
        const code = d?.code ? `${d.code}: ` : '';
        setError(`${code}${d?.message || e.message || 'Request failed'}`);
        setBrief(null);
        setPreviewOpen(false);
      }
    } finally {
      if (!silent) setLoading(false);
      else setLiveRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    Api.getTraderDeckMarketDecoderSymbols({ preset: 'quick', limit: 5 })
      .then((res) => {
        const list = res.data?.suggestions;
        if (cancel || !Array.isArray(list) || !list.length) return;
        setQuickChips(list.map((x) => x.symbol).filter(Boolean));
      })
      .catch((e) => {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[MarketDecoderView] quick symbols preset failed', e?.message || e);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const t = String(q || '').trim();
    if (t.length < 1) {
      setSuggestions([]);
      return undefined;
    }
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => {
      Api.getTraderDeckMarketDecoderSymbols({ query: t, limit: 6 })
        .then((res) => {
          const list = res.data?.suggestions;
          setSuggestions(Array.isArray(list) ? list : []);
        })
        .catch(() => setSuggestions([]));
    }, 220);
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [q]);

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

  useEffect(() => {
    if (!previewOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPreviewOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [previewOpen]);

  const onSubmit = (e) => {
    e.preventDefault();
    setSuggestions([]);
    run(String(q || '').trim(), true);
  };

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
      toast.success('Brief downloaded as JSON.');
    } catch (e) {
      console.warn(e);
      toast.error('Could not download JSON. Try again.');
    }
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
          <title>MARKET DECODER ${escapeHtml(symbol)}</title>
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
          <h1>MARKET DECODER preview · ${escapeHtml(symbol)}</h1>
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
    if (!w) {
      toast.error('Allow pop-ups for this site to use Print / PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 120);
  }, [brief, q]);

  const exportToTraderLab = useCallback(() => {
    if (!brief) return;
    const symbol = String(activeSymbol || brief?.header?.asset || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const chips = quickChips.length ? quickChips : QUICK;
    const symbolUniverse = [...new Set([symbol, ...chips].filter(Boolean))];
    const kl = brief?.keyLevels || {};
    const traderLabHandoff = {
      symbol,
      generatedAt: brief?.meta?.generatedAt || null,
      bias: brief?.instantRead?.bias || null,
      conviction: brief?.instantRead?.conviction || null,
      tradingCondition: brief?.instantRead?.tradingCondition || null,
      thesis: brief?.finalOutput?.reason || null,
      currentPosture: brief?.finalOutput?.currentPosture || null,
      postureSubtitle: brief?.finalOutput?.postureSubtitle || null,
      bestApproach: brief?.instantRead?.bestApproach || null,
      whatWouldChange: brief?.finalOutput?.whatWouldChangeThis || null,
      keyLevelsNumeric: {
        spot: brief?.header?.price != null ? Number(brief.header.price) : null,
        resistance1: kl.resistance1 ?? null,
        resistance2: kl.resistance2 ?? null,
        support1: kl.support1 ?? null,
        support2: kl.support2 ?? null,
        previousDayHigh: kl.previousDayHigh ?? null,
        previousDayLow: kl.previousDayLow ?? null,
        weeklyHigh: kl.weeklyHigh ?? null,
        weeklyLow: kl.weeklyLow ?? null,
        pivot: brief?.decoderScenario?.trigger ?? null,
        invalidation: brief?.decoderScenario?.invalidation ?? null,
      },
      execution: {
        preferredDirection: brief?.executionGuidance?.preferredDirection || null,
        entryCondition: brief?.executionGuidance?.entryCondition || null,
        invalidation: brief?.executionGuidance?.invalidation || null,
        riskConsideration: brief?.executionGuidance?.riskConsideration || null,
        avoidThis: brief?.executionGuidance?.avoidThis || null,
      },
      scenarios: {
        bullish: brief?.scenarioMap?.bullish?.condition || null,
        bearish: brief?.scenarioMap?.bearish?.condition || null,
        noTrade: brief?.scenarioMap?.noTrade?.when || null,
      },
      deskLogLine: [brief?.marketPulse?.signalBrief, brief?.finalOutput?.whatWouldChangeThis].filter(Boolean).join(' · ') || null,
      dataSufficiency: brief?.meta?.dataSufficiency || null,
    };
    const payload = {
      version: 5,
      exportedAt: new Date().toISOString(),
      symbol,
      decodedSymbol: symbol,
      source: 'market_decoder',
      symbolUniverse,
      traderLabHandoff,
      summary: {
        posture: brief?.finalOutput?.currentPosture || null,
        bias: brief?.instantRead?.bias || null,
        conviction: brief?.instantRead?.conviction || null,
      },
      brief,
    };
    try {
      sessionStorage.setItem(MARKET_DECODER_LAB_HANDOFF_KEY, JSON.stringify(payload));
    } catch (e) {
      // sessionStorage can fail on quota/privacy settings; fall back to localStorage.
      try {
        localStorage.setItem(MARKET_DECODER_LAB_HANDOFF_KEY, JSON.stringify(payload));
      } catch (e2) {
        console.warn(e);
        console.warn(e2);
        toast.error('Could not export this brief to Trader Lab. Try again.');
        return;
      }
    }
    setPreviewOpen(false);
    toast.info('Opening Trader Lab with your Market Decoder context.');
    navigate('/trader-deck/trade-validator/trader-lab');
  }, [brief, activeSymbol, navigate, quickChips]);

  const pairLabel = brief ? formatPairLabel(brief.header?.asset) : '';

  return (
    <div className={`md-decoder md-decoder--reference ${embedded ? 'md-decoder--embedded' : ''}`}>
      <header className="md-ref-top">
        <p className="md-ref-aura">Aura Terminal</p>
        <h1 className="md-ref-title">Market Decoder</h1>
        {brief?.finalOutput?.currentPosture === 'DATA INCOMPLETE' ? (
          <div className="md-ref-structure-alert" role="alert">
            <strong>Structural bias not scored</strong>
            <span>
              Five daily closes are required for trend, MAs, and pivots. Quote and calendar may still apply — use Refresh
              decode or confirm symbol mapping. Full detail appears in the brief preview.
            </span>
          </div>
        ) : null}
        <div className="md-ref-search-wrap">
          <form className="md-ref-search" onSubmit={onSubmit} autoComplete="off" role="search">
            <FiSearch className="md-ref-search-ico" aria-hidden />
            <input
              className="md-ref-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Symbol or name (e.g. EUR, gold, SPY)"
              aria-label="Asset symbol or name"
              aria-autocomplete="list"
              aria-controls="md-decoder-suggest-list"
              aria-expanded={suggestions.length > 0}
            />
            <button type="button" className="md-ref-mic" aria-label="Voice search">
              <FiMic aria-hidden />
            </button>
            <button type="submit" className="md-ref-decode" disabled={loading}>
              {loading ? '…' : 'Decode'}
            </button>
          </form>
          {suggestions.length > 0 ? (
            <ul id="md-decoder-suggest-list" className="md-ref-suggest-panel" role="listbox" aria-label="Symbol suggestions">
              {suggestions.map((row) => (
                <li key={row.symbol} role="none">
                  <button
                    type="button"
                    role="option"
                    className="md-ref-suggest-item"
                    onClick={() => {
                      setQ(row.symbol);
                      setSuggestions([]);
                      run(row.symbol, true);
                    }}
                  >
                    <span className="md-ref-suggest-symbol">{row.symbol}</span>
                    {row.label && row.label !== row.symbol ? (
                      <span className="md-ref-suggest-label">{row.label}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="md-ref-chips" role="group" aria-label="Quick symbols">
          {quickChips.map((s) => (
            <button key={s} type="button" className="md-ref-chip" onClick={() => { setQ(s); setSuggestions([]); run(s, true); }}>
              {s}
            </button>
          ))}
        </div>
        <div className="md-ref-meta-row">
          {cached && brief ? (
            <span className="md-ref-cache-note">
              Cached snapshot
              {cacheSnapshot.ageSec != null ? ` · ${cacheSnapshot.ageSec}s old` : ''}
              {cacheSnapshot.ttlSec != null ? ` · TTL ~${cacheSnapshot.ttlSec}s` : ''} — Decode again for live refresh
            </span>
          ) : null}
          {brief ? (
            <span className="md-ref-live" role="status">
              <span className="md-ref-live-dot" aria-hidden />
              Live ~{Math.round(LIVE_POLL_MS / 1000)}s
              {formatGeneratedAt(brief.meta?.generatedAt) ? ` · ${formatGeneratedAt(brief.meta.generatedAt)}` : ''}
              {liveRefreshing ? ' · Updating' : ''}
            </span>
          ) : null}
          {brief && !previewOpen ? (
            <button type="button" className="md-ref-link-btn md-ref-link-btn--emphasis" onClick={() => setPreviewOpen(true)}>
              Open preview
            </button>
          ) : null}
        </div>
        <div className="md-ref-flow-note">
          <strong>Flow:</strong> Decode a symbol → review the full brief in the preview → <strong>Export</strong> sends bias, levels,
          and context into <strong>Trader Lab</strong> (Trade Validator). Then use Checklist and Calculator.
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

      {!brief ? (
        <div className="md-ref-placeholder">
          <p className="md-ref-placeholder-msg">Decode a symbol to open the brief preview.</p>
        </div>
      ) : !previewOpen ? (
        <div className="md-ref-placeholder md-ref-placeholder--brief-ready">
          <p className="md-ref-placeholder-msg">
            Brief ready for <strong>{activeSymbol || pairLabel}</strong>. Open the preview to read the full desk, then export to Trader Lab.
          </p>
          <button type="button" className="md-preview-open-btn" onClick={() => setPreviewOpen(true)}>
            Open preview
          </button>
        </div>
      ) : null}

      {typeof document !== 'undefined' && brief && previewOpen
        ? createPortal(
            <>
              <CosmicBackground />
              <div
                className="td-intel-preview-overlay md-decoder-intel-overlay"
                role="presentation"
                onClick={() => setPreviewOpen(false)}
              >
                <div
                  className="td-intel-preview-box td-intel-preview-box--fullscreen td-intel-preview-box--protected"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="md-preview-title"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="td-intel-preview-chrome--minimal md-decoder-intel-chrome">
                    <div className="md-decoder-intel-chrome-text">
                      <p id="md-preview-title" className="td-intel-preview-title-bar">
                        Market Decoder — {pairLabel || activeSymbol}
                      </p>
                      <p className="md-decoder-intel-chrome-sub">
                        Review the brief, then Export to continue in Trader Lab with this context.
                      </p>
                      {brief?.meta?.generatedAt ? (
                        <p className="md-decoder-intel-generated" title={brief.meta.generatedAt}>
                          Last updated ·{' '}
                          {(() => {
                            const t = Date.parse(brief.meta.generatedAt);
                            if (Number.isNaN(t)) return brief.meta.generatedAt;
                            try {
                              return new Intl.DateTimeFormat(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(t));
                            } catch {
                              return brief.meta.generatedAt;
                            }
                          })()}
                        </p>
                      ) : null}
                    </div>
                    <div className="md-decoder-intel-actions">
                      <button type="button" className="md-decoder-intel-export" onClick={exportToTraderLab}>
                        Export
                      </button>
                      <button
                        type="button"
                        className="td-intel-preview-close--floating"
                        aria-label="Close preview"
                        onClick={() => setPreviewOpen(false)}
                      >
                        <FaTimes />
                      </button>
                    </div>
                  </div>
                  <div className="td-intel-preview-frame-wrap md-decoder-intel-frame">
                    <div className="md-decoder-intel-scroll">
                      <div className="md-decoder md-decoder--reference md-decoder--intel-preview-inner">
                        <MarketDecoderBriefContent brief={brief} />
                      </div>
                    </div>
                    <footer className="md-decoder-intel-footer">
                      <div className="md-preview-footer-extras">
                        <button type="button" className="md-preview-linkish" onClick={exportPreviewPdf}>
                          Print / PDF
                        </button>
                        <button type="button" className="md-preview-linkish" onClick={exportJson}>
                          Download JSON
                        </button>
                      </div>
                    </footer>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
