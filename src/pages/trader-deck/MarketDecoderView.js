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
import '../../styles/trader-deck/MarketIntelligenceBriefPreview.css';
import '../../styles/trader-deck/MarketDecoder.css';

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];
const DECODER_SYMBOL_UNIVERSE = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURJPY', 'GBPJPY', 'EURGBP',
  'XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'XNGUSD',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD',
  'SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'TLT',
  'US500', 'NAS100', 'US30', 'DXY', 'VIX',
];
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

export default function MarketDecoderView({ embedded }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('EURUSD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [cached, setCached] = useState(false);
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
        if (!silent) {
          const msg = data.message || 'Could not decode this symbol.';
          const code = data.code ? `${data.code}: ` : '';
          setError(`${code}${msg}`);
          setBrief(null);
          setPreviewOpen(false);
        }
        return;
      }
      setBrief(data.brief);
      setCached(Boolean(data.cached));
      setActiveSymbol(sym);
      if (!silent) {
        setPreviewOpen(true);
      }
    } catch (e) {
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
    run(q, true);
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
    const payload = {
      version: 4,
      exportedAt: new Date().toISOString(),
      symbol,
      decodedSymbol: symbol,
      source: 'market_decoder',
      symbolUniverse: DECODER_SYMBOL_UNIVERSE,
      summary: {
        posture: brief?.finalOutput?.currentPosture || null,
        bias: brief?.instantRead?.bias || null,
        conviction: brief?.instantRead?.conviction || null,
      },
      brief, // Keep full decoded brief so Trader Lab receives the exact decoded context.
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
  }, [brief, activeSymbol, navigate]);

  const pairLabel = brief ? formatPairLabel(brief.header?.asset) : '';

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
