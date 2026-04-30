import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiSearch, FiMic } from 'react-icons/fi';
import { FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import Api from '../../services/Api';
import CosmicBackground from '../../components/CosmicBackground';
import MarketDecoderBriefContent from './MarketDecoderBriefContent';
import { MARKET_DECODER_LAB_HANDOFF_KEY } from '../../lib/aura-analysis/validator/validatorChecklistStorage';
import { formatPairLabel } from '../../lib/market/formatPairLabel';
import { buildMarketDecoderExport } from '../../lib/trader-deck/marketDecoderExport';
import '../../styles/trader-deck/MarketIntelligenceBriefPreview.css';
import '../../styles/trader-deck/MarketDecoder.css';
import { sanitizeTraderDeskPayloadDeep } from '../../utils/sanitizeAiDeskOutput.react.js';
import '../../styles/MarketDecoderPremium.css'; 

const QUICK = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY', 'USDJPY'];
const LIVE_POLL_MS = Math.max(45000, parseInt(process.env.REACT_APP_MARKET_DECODER_POLL_MS || '60000', 10) || 60000);

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

export default function MarketDecoderView({ embedded }) {
  const { t } = useTranslation();
  const decoderFlow = [
    { step: '1', title: t('marketDecoder.flowStep1Title'), note: t('marketDecoder.flowStep1Note') },
    { step: '2', title: t('marketDecoder.flowStep2Title'), note: t('marketDecoder.flowStep2Note') },
    { step: '3', title: t('marketDecoder.flowStep3Title'), note: t('marketDecoder.flowStep3Note') },
    { step: '4', title: t('marketDecoder.flowStep4Title'), note: t('marketDecoder.flowStep4Note') },
  ];
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
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const sym = activeSymbolRef.current;
      // Background poll should respect backend cache; hard refresh stays user-triggered.
      if (sym) run(sym, false, true);
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [brief, activeSymbol, run]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const sym = activeSymbolRef.current;
      if (sym && brief) run(sym, false, true);
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
      toast.success(t('marketDecoder.toast.downloadedJson'));
    } catch (e) {
      console.warn(e);
      toast.error(t('marketDecoder.toast.downloadJsonFailed'));
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
      toast.error(t('marketDecoder.toast.allowPopups'));
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
    const traderLabHandoff = buildMarketDecoderExport(brief, {
      symbol,
      playbookSetup: 'Market Decoder',
      sessionFocus: brief?.instantRead?.bestApproach || '',
    });
    const payload = {
      version: 6,
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
        toast.error(t('marketDecoder.toast.exportToTraderLabFailed'));
        return;
      }
    }
    setPreviewOpen(false);
    toast.info(t('marketDecoder.toast.openingTraderLab'));
    navigate('/trader-deck/trade-validator/trader-lab');
  }, [brief, activeSymbol, navigate, quickChips]);

  const pairLabel = brief ? formatPairLabel(brief.header?.asset) : '';

  return (
    <div className={`md-decoder md-decoder--reference ${embedded ? 'md-decoder--embedded' : ''}`}>
      <header className="md-ref-top">
        <p className="md-ref-aura">{t('marketDecoder.auraTerminal')}</p>
        <h1 className="md-ref-title">{t('marketDecoder.title')}</h1>
        {brief?.finalOutput?.currentPosture === 'DATA INCOMPLETE' ? (
          <div className="md-ref-structure-alert" role="alert">
              <strong>{t('marketDecoder.structureBiasNotScored')}</strong>
            <span>
                {t('marketDecoder.structureBiasHelp')}
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
              placeholder={t('marketDecoder.searchPlaceholder')}
              aria-label={t('marketDecoder.searchAria')}
              aria-autocomplete="list"
              aria-controls="md-decoder-suggest-list"
              aria-expanded={suggestions.length > 0}
            />
            <button type="button" className="md-ref-mic" aria-label={t('marketDecoder.voiceSearch')}>
              <FiMic aria-hidden />
            </button>
            <button type="submit" className="md-ref-decode" disabled={loading}>
              {loading ? '…' : t('marketDecoder.decode')}
            </button>
          </form>
          {suggestions.length > 0 ? (
            <ul id="md-decoder-suggest-list" className="md-ref-suggest-panel" role="listbox" aria-label={t('marketDecoder.symbolSuggestions')}>
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
        <div className="md-ref-chips" role="group" aria-label={t('marketDecoder.quickSymbols')}>
          {quickChips.map((s) => (
            <button key={s} type="button" className="md-ref-chip" onClick={() => { setQ(s); setSuggestions([]); run(s, true); }}>
              {s}
            </button>
          ))}
        </div>
        <div className="md-ref-meta-row">
          {cached && brief ? (
            <span className="md-ref-cache-note">
              {t('marketDecoder.cachedSnapshot')}
              {cacheSnapshot.ageSec != null ? ` · ${cacheSnapshot.ageSec}s old` : ''}
              {cacheSnapshot.ttlSec != null ? ` · TTL ~${cacheSnapshot.ttlSec}s` : ''} — {t('marketDecoder.decodeAgainForRefresh')}
            </span>
          ) : null}
          {brief ? (
            <span className="md-ref-live" role="status">
              <span className="md-ref-live-dot" aria-hidden />
              {t('marketDecoder.liveEvery', { seconds: Math.round(LIVE_POLL_MS / 1000) })}
              {formatGeneratedAt(brief.meta?.generatedAt) ? ` · ${formatGeneratedAt(brief.meta.generatedAt)}` : ''}
              {liveRefreshing ? ` · ${t('marketDecoder.updating')}` : ''}
            </span>
          ) : null}
          {brief && !previewOpen ? (
            <button type="button" className="md-ref-link-btn md-ref-link-btn--emphasis" onClick={() => setPreviewOpen(true)}>
              {t('marketDecoder.openPreview')}
            </button>
          ) : null}
        </div>
        <div className="md-ref-flow-note">
          <strong>{t('marketDecoder.flow')}</strong> {t('marketDecoder.flowText')}
        </div>
        <details className="md-ref-details-help">
          <summary className="md-ref-details-sum">{t('marketDecoder.howToUse')}</summary>
          <div className="md-decoder-hero-grid md-decoder-hero-grid--nested">
            <div className="md-decoder-flow" aria-label="Decoder workflow">
              {decoderFlow.map((item) => (
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
                <span className="md-hero-rail-label">{t('marketDecoder.whatThisIs')}</span>
                <strong>{t('marketDecoder.whatThisIsText')}</strong>
              </div>
              <div className="md-hero-rail-card">
                <span className="md-hero-rail-label">{t('marketDecoder.bestUse')}</span>
                <strong>{t('marketDecoder.bestUseText')}</strong>
              </div>
            </aside>
          </div>
        </details>
      </header>

      {error ? <div className="md-decoder-error" role="alert">{error}</div> : null}

      {!brief ? (
        <div className="md-ref-placeholder">
          <p className="md-ref-placeholder-msg">{t('marketDecoder.decodeSymbolToOpen')}</p>
        </div>
      ) : !previewOpen ? (
        <div className="md-ref-placeholder md-ref-placeholder--brief-ready">
          <p className="md-ref-placeholder-msg">
            {t('marketDecoder.briefReadyFor')} <strong>{activeSymbol || pairLabel}</strong>. {t('marketDecoder.openPreviewThenExport')}
          </p>
          <button type="button" className="md-preview-open-btn" onClick={() => setPreviewOpen(true)}>
            {t('marketDecoder.openPreview')}
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
                        {t('marketDecoder.title')} — {pairLabel || activeSymbol}
                      </p>
                      <p className="md-decoder-intel-chrome-sub">
                        {t('marketDecoder.reviewThenExport')}
                      </p>
                      {brief?.meta?.generatedAt ? (
                        <p className="md-decoder-intel-generated" title={brief.meta.generatedAt}>
                          {t('marketDecoder.lastUpdated')} ·{' '}
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
                        {t('marketDecoder.export')}
                      </button>
                      <button
                        type="button"
                        className="td-intel-preview-close--floating"
                        aria-label={t('marketDecoder.closePreview')}
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
                          {t('marketDecoder.printPdf')}
                        </button>
                        <button type="button" className="md-preview-linkish" onClick={exportJson}>
                          {t('marketDecoder.downloadJson')}
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
