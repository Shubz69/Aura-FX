/**
 * Market Intelligence briefs for Trader Deck – date-scoped Daily or Weekly.
 * Preview in a fullscreen body portal (no new tab / no direct download flow). Admin: delete only (uploads via admin tools/API).
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import Api from '../../services/Api';
import '../../styles/trader-deck/MarketIntelligenceBriefPreview.css';
import { FaEye, FaTrash, FaTimes } from 'react-icons/fa';
import CosmicBackground from '../../components/CosmicBackground';
import { getTraderDeckIntelStorageYmd, formatLondonWeekRangeFromWeekEndingSundayYmd } from '../../lib/trader-deck/deskDates';
import { stripModelInternalExposition } from '../../utils/sanitizeAiDeskOutput.mjs';
import { polishBriefMarkdown } from '../../utils/briefPresentationSanitize';

function googleViewerEmbedUrl(fileUrl) {
  const u = (fileUrl || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(u)}&embedded=true`;
}

function officeViewerEmbedUrl(fileUrl) {
  const u = (fileUrl || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(u)}`;
}

function isPowerPointMime(mime) {
  const m = (mime || '').toLowerCase();
  return m.includes('application/vnd.ms-powerpoint') ||
    m.includes('application/vnd.openxmlformats-officedocument.presentationml.presentation');
}

function isPdfMime(mime) {
  return (mime || '').toLowerCase().includes('application/pdf');
}

function displayBriefTitle(title) {
  const t = String(title || '').replace(/^\s*\[AUTO\]\s*/i, '').trim();
  return t || 'Brief';
}

const BRIEF_KIND_ORDER = [
  'aura_institutional_daily',
  'aura_institutional_weekly',
  'stocks',
  'indices',
  'futures',
  'forex',
  'crypto',
  'commodities',
  'bonds',
  'etfs',
  /** Legacy/default DB rows (`brief_kind` default) — must match API list; was excluded server-side until fixed */
  'general',
];
const BRIEF_KIND_LABEL = {
  aura_institutional_daily: 'Institutional Daily',
  aura_institutional_weekly: 'Institutional Weekly',
  stocks: 'Stocks',
  indices: 'Indices',
  futures: 'Futures',
  forex: 'Forex',
  crypto: 'Crypto',
  commodities: 'Commodities',
  bonds: 'Bonds',
  etfs: 'ETFs',
  general: 'Desk brief',
};

const CATEGORY_BRIEF_KINDS = new Set([
  'stocks',
  'indices',
  'futures',
  'forex',
  'crypto',
  'commodities',
  'bonds',
  'etfs',
]);

/** All brief kinds we load and show (institutional + desk + eight asset sleeves + legacy general). */
const ALLOWED_BRIEF_KINDS = new Set([
  'aura_institutional_daily',
  'aura_institutional_weekly',
  ...CATEGORY_BRIEF_KINDS,
  'general',
]);

const BY_AURA_TERMINAL = 'By AURA TERMINAL';

/** Markdown `code` / ```fences``` rendered as prose (no monospace “IDE” blocks). */
const BRIEF_MARKDOWN_COMPONENTS = {
  a: ({ node: _a, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  pre: ({ node: _p, children, ...props }) => (
    <div className="td-intel-brief-md-fenced" {...props}>
      {children}
    </div>
  ),
  code: ({ node: _c, inline, className: _cn, children, ...props }) =>
    inline ? (
      <span className="td-intel-brief-md-code-inline" {...props}>
        {children}
      </span>
    ) : (
      <div className="td-intel-brief-md-code-block" {...props}>
        {children}
      </div>
    ),
};

/** Preview text: preserve markdown headings (section layout); polish separators/casing to match backend. */
function sanitizeBriefForPreview(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');

  // Strip ```fences``` (keep inner text); strip inline backticks from legacy docs.
  t = t.replace(/```(?:[\w-]+)?\s*\n?([\s\S]*?)```/g, (_, inner) => `\n${String(inner || '').trim()}\n`);
  t = t.replace(/`([^`\n]+)`/g, '$1');

  t = t.replace(/^\s*By\s+Aura\s+FX\s+AI\s*$/gim, '');
  t = t.replace(/^\s*By\s+AURA\s+TERMINAL\s*$/gim, '');

  t = stripModelInternalExposition(t);
  t = polishBriefMarkdown(t);

  const endsWithFooter = new RegExp(
    `${BY_AURA_TERMINAL.replace(/\s+/g, '\\s+')}\\s*$`,
    'i'
  ).test(t);
  if (!endsWithFooter) {
    t = `${t}\n\n${BY_AURA_TERMINAL}`;
  }
  return t.trim();
}

/** Ensure every API row renders: unknown brief_kind maps to general (never drop silently). */
function normalizeBriefsList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((b) => b && typeof b === 'object')
    .map((b) => {
      const k = String(b.briefKind || '').toLowerCase();
      if (ALLOWED_BRIEF_KINDS.has(k)) return b;
      return { ...b, briefKind: 'general' };
    });
}

const BRIEF_POLL_MS = 3000;
const BRIEF_POLL_MAX = 15;
/** Partial-pack polling may need longer while several category briefs generate server-side. */
const BRIEF_PARTIAL_POLL_MAX = 60;

/**
 * Empty desk copy: never expose env var names, secrets, or internal API routes to all users.
 * Operational detail is optional and only appended for admins (`canEdit`).
 */
function emptyDeskMessagesFor(canEdit, phase) {
  const userFirst =
    'No briefs are available for this desk date yet. This list refreshes automatically — try again shortly or choose another date.';
  const userRepeat =
    'No briefs are available for this desk date yet. Try another date or check back later.';
  const adminFirst =
    'A background refresh was requested once for this browser session. If packs stay empty, confirm scheduled desk automation is enabled on the server and review Admin → integration health.';
  const adminRepeat =
    'Still empty: the scheduled job may not have finished, integrations may be offline, or generation failed — check deployment logs and Admin → integration health.';

  const userText = phase === 'first' ? userFirst : userRepeat;
  if (!canEdit) return { userText };
  return {
    userText,
    adminText: phase === 'first' ? adminFirst : adminRepeat,
  };
}

function briefsPayloadFromContentResponse(res, fallbackStorageDate) {
  const raw = Array.isArray(res.data?.briefs) ? res.data.briefs : [];
  const list = normalizeBriefsList(raw);
  const weekendFallback = Boolean(res.data?.weekendFallback);
  const src = String(res.data?.briefsSourceDate || fallbackStorageDate).trim().slice(0, 10);
  const briefsRowCount =
    typeof res.data?.briefsRowCount === 'number' ? res.data.briefsRowCount : raw.length;
  const deskAutomationConfigured = Boolean(res.data?.deskAutomationConfigured);
  return {
    list,
    weekendNote: weekendFallback ? { sourceDate: src } : null,
    deskMeta: { briefsRowCount, deskAutomationConfigured },
  };
}

function isTextLikeMime(mime) {
  const m = (mime || '').toLowerCase();
  return (
    m.startsWith('text/')
    || m.includes('markdown')
    || m.includes('json')
    || m.includes('xml')
    || m.includes('javascript')
  );
}

export default function MarketIntelligenceBriefsView({ selectedDate, period, canEdit }) {
  const type = period === 'weekly' ? 'intel-weekly' : 'intel-daily';
  const storageDateStr = useMemo(
    () => getTraderDeckIntelStorageYmd(selectedDate, period),
    [selectedDate, period]
  );
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState(null);
  const [previewBriefMeta, setPreviewBriefMeta] = useState(null);
  const [textPreviewBody, setTextPreviewBody] = useState('');
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  /** Character count while “typing” markdown source; full length ⇒ show rendered brief. */
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState(null);
  const [selectedKinds, setSelectedKinds] = useState(() => new Set(BRIEF_KIND_ORDER));
  /** UK weekend daily view: server serves previous weekday’s briefs */
  const [weekendBriefsNote, setWeekendBriefsNote] = useState(null);
  /** When the desk date has zero stored briefs: safe user copy + optional admin-only hint */
  const [emptyDeskMessages, setEmptyDeskMessages] = useState(null);
  /** Last GET intel payload diagnostics (non-secret; helps admins see DB vs automation). */
  const [intelDeskMeta, setIntelDeskMeta] = useState(null);
  const typewriterScrollRef = useRef(null);
  const filterWrapRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterMenuRef = useRef(null);
  const sortedBriefs = useMemo(() => {
    const orderIndex = new Map(BRIEF_KIND_ORDER.map((k, i) => [k, i]));
    return [...briefs].sort((a, b) => {
      const ak = String(a?.briefKind || '').toLowerCase();
      const bk = String(b?.briefKind || '').toLowerCase();
      const ao = orderIndex.get(ak) || 99;
      const bo = orderIndex.get(bk) || 99;
      if (ao !== bo) return ao - bo;
      const av = Number(a?.briefVersion || 1);
      const bv = Number(b?.briefVersion || 1);
      if (av !== bv) return bv - av;
      const at = new Date(a?.createdAt || 0).getTime();
      const bt = new Date(b?.createdAt || 0).getTime();
      return bt - at;
    });
  }, [briefs]);

  const displayedBriefs = useMemo(() => {
    if (!sortedBriefs.length) return [];
    return sortedBriefs.filter((b) => selectedKinds.has(String(b?.briefKind || '').toLowerCase()));
  }, [sortedBriefs, selectedKinds]);

  const categoryBriefCount = useMemo(
    () => briefs.filter((b) => CATEGORY_BRIEF_KINDS.has(String(b?.briefKind || '').toLowerCase())).length,
    [briefs]
  );
  const hasInstitutionalBrief = useMemo(
    () => briefs.some((b) => String(b?.briefKind || '').toLowerCase().startsWith('aura_institutional')),
    [briefs]
  );

  /** Server may be gap-filling remaining sleeves in the background — keep polling until the full pack lands. */
  const needsPartialIntelPoll = useMemo(
    () =>
      Boolean(intelDeskMeta?.deskAutomationConfigured) &&
      briefs.length > 0 &&
      (categoryBriefCount < CATEGORY_BRIEF_KINDS.size || !hasInstitutionalBrief),
    [
      intelDeskMeta?.deskAutomationConfigured,
      briefs.length,
      categoryBriefCount,
      hasInstitutionalBrief,
    ]
  );

  const weekendSourceLabel = useMemo(() => {
    const iso = weekendBriefsNote?.sourceDate;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [weekendBriefsNote]);

  const previewOpen = Boolean(previewId || previewEmbedUrl);

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewEmbedUrl(null);
    setPreviewBriefMeta(null);
    setTextPreviewBody('');
    setTextPreviewLoading(false);
    setTypewriterIndex(0);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onDown = (e) => {
      const wrap = filterWrapRef.current;
      const menu = filterMenuRef.current;
      const t = e.target;
      if (wrap?.contains(t) || menu?.contains(t)) return;
      setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filtersOpen]);

  const updateFilterMenuPosition = useCallback(() => {
    const btn = filterButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(280, Math.max(200, window.innerWidth - 16));
    const left = Math.max(8, r.right - width);
    const estH = 360;
    let top = r.bottom + 8;
    if (top + estH > window.innerHeight - 12) {
      top = Math.max(8, r.top - estH - 8);
    }
    setFilterMenuPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!filtersOpen) {
      setFilterMenuPos(null);
      return undefined;
    }
    updateFilterMenuPosition();
    window.addEventListener('resize', updateFilterMenuPosition);
    window.addEventListener('scroll', updateFilterMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateFilterMenuPosition);
      window.removeEventListener('scroll', updateFilterMenuPosition, true);
    };
  }, [filtersOpen, updateFilterMenuPosition]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const blockCopy = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    document.addEventListener('copy', blockCopy, true);
    document.addEventListener('cut', blockCopy, true);
    return () => {
      document.removeEventListener('copy', blockCopy, true);
      document.removeEventListener('cut', blockCopy, true);
    };
  }, [previewOpen]);

  const fetchBriefsPayload = useCallback(
    (cacheBust) =>
      Api.getTraderDeckContent(type, storageDateStr, {
        cacheBust: !!cacheBust,
        /** Never autogen on list reads — cron fills briefs; `autogen=1` is reserved for explicit operator backfill. */
        autogen: false,
      }).then((res) => briefsPayloadFromContentResponse(res, storageDateStr)),
    [type, storageDateStr]
  );

  const handleManualBriefsRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBriefsPayload(true)
      .then((payload) => {
        setBriefs(payload.list);
        setWeekendBriefsNote(payload.weekendNote);
        setIntelDeskMeta(payload.deskMeta ?? null);
        if (payload.list.length > 0) {
          setEmptyDeskMessages(null);
        }
      })
      .catch(() => setError('Failed to load briefs'))
      .finally(() => setLoading(false));
  }, [fetchBriefsPayload]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer = null;
    let pollCount = 0;
    setLoading(true);
    setError(null);
    setSelectedKinds(new Set(BRIEF_KIND_ORDER));
    setWeekendBriefsNote(null);
    setEmptyDeskMessages(null);
    setIntelDeskMeta(null);

    const finishLoading = () => {
      if (!cancelled) setLoading(false);
    };

    fetchBriefsPayload(false)
      .then((payload) => {
        if (cancelled) return;
        setBriefs(payload.list);
        setWeekendBriefsNote(payload.weekendNote);
        setIntelDeskMeta(payload.deskMeta ?? null);
        if (payload.list.length > 0) {
          setEmptyDeskMessages(null);
          return;
        }

        try {
          const key = `td-brief-desk-backfill-${type}-${storageDateStr}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            setEmptyDeskMessages(emptyDeskMessagesFor(canEdit, 'first'));
            Api.getTraderDeckContent(type, storageDateStr, { autogen: true }).catch(() => {});
          } else {
            setEmptyDeskMessages(emptyDeskMessagesFor(canEdit, 'repeat'));
          }
        } catch (_) {
          setEmptyDeskMessages({ userText: 'No briefs for this date.' });
        }

        pollTimer = setInterval(() => {
          if (cancelled) return;
          pollCount += 1;
          if (pollCount > BRIEF_POLL_MAX) {
            clearInterval(pollTimer);
            pollTimer = null;
            return;
          }
          fetchBriefsPayload(true)
            .then((nextPayload) => {
              if (cancelled) return;
              setIntelDeskMeta(nextPayload.deskMeta ?? null);
              if (!nextPayload.list.length) return;
              setBriefs(nextPayload.list);
              setWeekendBriefsNote(nextPayload.weekendNote);
              setEmptyDeskMessages(null);
              if (pollTimer) clearInterval(pollTimer);
              pollTimer = null;
            })
            .catch(() => {});
        }, BRIEF_POLL_MS);
      })
      .catch(() => {
        if (cancelled) return;
        setBriefs([]);
        setIntelDeskMeta(null);
        setError('Failed to load briefs');
      })
      .finally(finishLoading);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [type, storageDateStr, fetchBriefsPayload, canEdit]);

  useEffect(() => {
    if (!needsPartialIntelPoll) return undefined;
    let cancelled = false;
    let pollCount = 0;
    const pollTimer = setInterval(() => {
      if (cancelled) return;
      pollCount += 1;
      if (pollCount > BRIEF_PARTIAL_POLL_MAX) {
        clearInterval(pollTimer);
        return;
      }
      fetchBriefsPayload(true)
        .then((nextPayload) => {
          if (cancelled) return;
          setIntelDeskMeta(nextPayload.deskMeta ?? null);
          setBriefs(nextPayload.list);
          setWeekendBriefsNote(nextPayload.weekendNote);
        })
        .catch(() => {});
    }, BRIEF_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [needsPartialIntelPoll, fetchBriefsPayload]);

  const storedPreviewSrc = useMemo(() => {
    if (!previewId) return null;
    return Api.getTraderDeckBriefPreviewUrl(previewId);
  }, [previewId]);

  const iframeSrc = previewEmbedUrl || storedPreviewSrc;

  useEffect(() => {
    const lock = previewOpen && Boolean(iframeSrc);
    if (!lock) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [previewOpen, iframeSrc]);

  const previewMime = (previewBriefMeta?.mimeType || '').toLowerCase();
  const previewIsPpt = isPowerPointMime(previewMime);
  const previewIsPdf = isPdfMime(previewMime);
  const previewIsTextLike = isTextLikeMime(previewMime);
  const previewHasExternalUrl = /^https?:\/\//i.test((previewBriefMeta?.fileUrl || '').trim());
  const previewUseMarkdown = Boolean(
    previewOpen && previewId && !previewEmbedUrl && storedPreviewSrc && previewIsTextLike
  );
  const previewCanIframe = Boolean(
    previewEmbedUrl || (!previewIsPpt && (previewIsPdf || storedPreviewSrc) && !previewUseMarkdown)
  );
  const previewDirectUrl = previewHasExternalUrl
    ? (previewBriefMeta?.fileUrl || '').trim()
    : (previewId ? Api.getTraderDeckBriefPreviewUrl(previewId) : null);

  useEffect(() => {
    if (!previewUseMarkdown) {
      setTextPreviewBody('');
      setTextPreviewLoading(false);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    setTextPreviewLoading(true);
    setTextPreviewBody('');
    fetch(storedPreviewSrc, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((raw) => {
        if (!cancelled) setTextPreviewBody(sanitizeBriefForPreview(String(raw || '').replace(/\r\n/g, '\n')));
      })
      .catch(() => {
        if (!cancelled) setTextPreviewBody('');
      })
      .finally(() => {
        if (!cancelled) setTextPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [previewUseMarkdown, storedPreviewSrc]);

  useEffect(() => {
    if (!previewUseMarkdown || textPreviewLoading) {
      setTypewriterIndex(0);
      return undefined;
    }
    const full = textPreviewBody;
    if (!full) {
      setTypewriterIndex(0);
      return undefined;
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setTypewriterIndex(full.length);
      return undefined;
    }

    setTypewriterIndex(0);
    const n = full.length;
    const TICK_MS = 16;
    const MAX_MS = 42000;
    const maxTicks = Math.max(1, Math.floor(MAX_MS / TICK_MS));
    const charsPerTick = Math.max(1, Math.ceil(n / maxTicks));
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(n, current + charsPerTick);
      setTypewriterIndex(current);
      if (current >= n) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [previewUseMarkdown, textPreviewLoading, textPreviewBody]);

  const typewriterActive =
    previewUseMarkdown &&
    !textPreviewLoading &&
    textPreviewBody.length > 0 &&
    typewriterIndex < textPreviewBody.length;

  useEffect(() => {
    if (!typewriterActive || !typewriterScrollRef.current) return;
    const el = typewriterScrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [typewriterActive, typewriterIndex]);

  const handlePreview = (brief) => {
    setPreviewBriefMeta({
      id: brief?.id || null,
      title: brief?.title || 'Brief',
      mimeType: brief?.mimeType || '',
      fileUrl: brief?.fileUrl || '',
    });
    const ext = (brief.fileUrl || '').trim();
    if (ext) {
      const officeEmbed = officeViewerEmbedUrl(ext);
      const embed = officeEmbed || googleViewerEmbedUrl(ext);
      if (embed) {
        setPreviewId(null);
        setPreviewEmbedUrl(embed);
        return;
      }
      setError('That link must be a public http(s) URL to preview here.');
      return;
    }
    setPreviewEmbedUrl(null);
    setPreviewId(brief.id);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Remove this brief?')) return;
    Api.deleteTraderDeckBrief(id)
      .then(() => setBriefs((prev) => prev.filter((b) => b.id !== id)))
      .catch((err) => setError(err.response?.data?.message || 'Delete failed'));
  };

  const toggleKindFilter = (kind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size === 1) return next; // keep at least one active
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedKinds(new Set(BRIEF_KIND_ORDER));
  };

  if (loading) {
    return (
      <div className="td-mi-loading td-mi-loading--page">
        <div className="td-mi-loading-pulse" aria-hidden />
        <p>Loading {period} briefs…</p>
      </div>
    );
  }

  const weekRangeLabel = period === 'weekly' ? formatLondonWeekRangeFromWeekEndingSundayYmd(storageDateStr) : '';
  const mainTitle =
    period === 'weekly' && weekRangeLabel
      ? `Market Intelligence — Weekly (${weekRangeLabel}) · week ending ${storageDateStr}`
      : `Market Intelligence — ${period === 'weekly' ? 'Weekly' : 'Daily'} (${storageDateStr})`;

  return (
    <>
      {error && (
        <p className="td-mi-fallback-msg" role="alert">
          {error}{' '}
          <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
            Retry fetch
          </button>
        </p>
      )}
      <div className="td-deck-mi-modern">
        <header className="td-deck-mi-modern-hero">
          <div className="td-deck-mi-modern-hero-copy">
            <p className="td-deck-mo-eyebrow">Market intelligence</p>
            <h1 className="td-deck-mi-modern-title">{mainTitle}</h1>
            <p className="td-deck-mi-modern-sub">
              Briefs are stored per calendar date (daily or weekly mode). Preview opens as a fullscreen overlay with a blurred backdrop — scroll inside the document; copying is discouraged and downloads are not linked from the list.
            </p>
            {period === 'daily' && weekendBriefsNote && (
              <p className="td-deck-mi-modern-sub td-deck-mi-weekend-note" role="note">
                Daily automated briefs run on UK business days (Monday–Friday) only. Showing the latest available
                pack from <strong>{weekendSourceLabel}</strong>.
              </p>
            )}
          </div>
          {briefs.length > 0 && (
            <div className="td-deck-mi-modern-stat" aria-hidden>
              <span className="td-deck-mi-modern-stat-value">
                {categoryBriefCount}/8
              </span>
              <span className="td-deck-mi-modern-stat-label">
                category brief{categoryBriefCount !== 1 ? 's' : ''}
                {hasInstitutionalBrief ? ' · institutional' : ''}
                {weekendBriefsNote ? ' (latest weekday pack)' : ''}
              </span>
            </div>
          )}
        </header>

        <div className="td-deck-mi-modern-grid">
          <section className="td-deck-mi-tile td-deck-mi-tile--list" aria-labelledby="intel-list-heading">
            <div className="td-deck-mi-tile-head">
              <h2 id="intel-list-heading" className="td-deck-mi-tile-title">Briefs</h2>
              <div className="td-deck-mi-head-tools">
                <div className="td-deck-mi-filter-wrap" ref={filterWrapRef}>
                  <button
                    ref={filterButtonRef}
                    type="button"
                    className="td-mi-btn td-mi-btn-small td-mi-btn-filter"
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-expanded={filtersOpen}
                    aria-haspopup="dialog"
                  >
                    Filter
                  </button>
                </div>
                <span className="td-deck-mi-tile-badge">{displayedBriefs.length}</span>
              </div>
            </div>
            <ul className="td-deck-mi-brief-cards">
              {displayedBriefs.length === 0 ? (
                <li className="td-deck-mi-brief-empty">
                  {emptyDeskMessages ? (
                    <>
                      <span className="td-deck-mi-empty-user">{emptyDeskMessages.userText}</span>
                      {emptyDeskMessages.adminText ? (
                        <span className="td-deck-mi-empty-admin" role="note">
                          {' '}
                          {emptyDeskMessages.adminText}
                        </span>
                      ) : null}
                      {canEdit && intelDeskMeta ? (
                        <span className="td-deck-mi-empty-desk-meta" role="note">
                          Desk rows for this date (server): {intelDeskMeta.briefsRowCount}. Automated generation available:{' '}
                          {intelDeskMeta.deskAutomationConfigured ? 'yes' : 'no'}
                          {!intelDeskMeta.deskAutomationConfigured
                            ? ' — configure the desk automation API key on the API host for scheduled briefs.'
                            : null}
                        </span>
                      ) : null}{' '}
                      <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
                        Retry fetch
                      </button>
                    </>
                  ) : (
                    <>
                      {canEdit && intelDeskMeta ? (
                        <span className="td-deck-mi-empty-desk-meta" role="note">
                          Desk rows for this date (server): {intelDeskMeta.briefsRowCount}. Automated generation available:{' '}
                          {intelDeskMeta.deskAutomationConfigured ? 'yes' : 'no'}
                          {!intelDeskMeta.deskAutomationConfigured
                            ? ' — configure the desk automation API key on the API host for scheduled briefs.'
                            : null}
                        </span>
                      ) : null}
                      No briefs for this date.{' '}
                      <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
                        Retry fetch
                      </button>
                    </>
                  )}
                </li>
              ) : (
                displayedBriefs.map((b) => (
                  <li key={b.id} className="td-deck-mi-brief-card">
                    <span className="td-deck-mi-brief-card-title">
                      [{BRIEF_KIND_LABEL[String(b?.briefKind || '').toLowerCase()] || 'Brief'}] {displayBriefTitle(b.title)}{Number(b?.briefVersion || 1) > 1 ? ` (v${Number(b.briefVersion)})` : ''}
                    </span>
                    <div className="td-deck-mi-brief-card-actions">
                      <button type="button" className="td-mi-btn td-mi-btn-small" onClick={() => handlePreview(b)} title="Fullscreen preview">
                        <FaEye /> Preview
                      </button>
                      {canEdit && (
                        <button type="button" className="td-mi-btn td-mi-btn-remove" onClick={() => handleDelete(b.id)} title="Remove">
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>

      {typeof document !== 'undefined' && filtersOpen && filterMenuPos && createPortal(
        <div
          ref={filterMenuRef}
          className="td-deck-mi-filter-popover td-deck-mi-filter-popover--portal"
          style={{
            top: filterMenuPos.top,
            left: filterMenuPos.left,
            width: filterMenuPos.width,
          }}
          role="dialog"
          aria-label="Brief filters"
        >
          <div className="td-deck-mi-filter-head">
            <span>Show brief types</span>
            <button type="button" className="td-mi-btn td-mi-btn-small" onClick={clearFilters}>
              Reset
            </button>
          </div>
          <div className="td-deck-mi-filter-list">
            {BRIEF_KIND_ORDER.map((kind) => (
              <label key={kind} className="td-deck-mi-filter-item">
                <input
                  type="checkbox"
                  checked={selectedKinds.has(kind)}
                  onChange={() => toggleKindFilter(kind)}
                />
                <span>{BRIEF_KIND_LABEL[kind] || kind}</span>
              </label>
            ))}
          </div>
        </div>,
        document.body
      )}

 {typeof document !== 'undefined' && previewOpen && iframeSrc && createPortal(
  <>
    <CosmicBackground />
    <div className="td-intel-preview-overlay" onClick={closePreview} role="presentation">
      <div
        className="td-intel-preview-box td-intel-preview-box--fullscreen td-intel-preview-box--protected"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={displayBriefTitle(previewBriefMeta?.title)}
      >
        <div className="td-intel-preview-chrome--minimal">
          <p className="td-intel-preview-title-bar" title={displayBriefTitle(previewBriefMeta?.title)}>
            {displayBriefTitle(previewBriefMeta?.title)}
          </p>
          <button type="button" className="td-intel-preview-close--floating" onClick={closePreview} aria-label="Close preview">
            <FaTimes />
          </button>
        </div>
        <div className="td-intel-preview-frame-wrap">
          {previewUseMarkdown ? (
            <div
              className="td-intel-preview-md-scroll"
              aria-busy={textPreviewLoading || typewriterActive}
            >
              {textPreviewLoading ? (
                <p className="td-intel-preview-md-loading">Loading brief…</p>
              ) : typewriterActive ? (
                <div
                  ref={typewriterScrollRef}
                  className="td-intel-preview-typewriter"
                  aria-live="off"
                >
                  <span className="td-intel-preview-typewriter-text">
                    {textPreviewBody.slice(0, typewriterIndex)}
                  </span>
                  <span className="td-intel-preview-typewriter-caret" aria-hidden />
                </div>
              ) : (
                <div className="td-intel-brief-md">
                  <ReactMarkdown components={BRIEF_MARKDOWN_COMPONENTS}>
                    {textPreviewBody || '_No text content._'}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ) : previewCanIframe ? (
            <iframe
              title={displayBriefTitle(previewBriefMeta?.title)}
              src={iframeSrc}
              className="td-intel-preview-iframe"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="td-intel-preview-fallback">
              <h3 className="td-intel-preview-fallback-title">{displayBriefTitle(previewBriefMeta?.title)}</h3>
              <p className="td-intel-preview-fallback-text">
                This file type cannot be rendered in-browser here. Use Open or Download, or upload a PDF for inline preview.
              </p>
              <div className="td-intel-preview-fallback-actions">
                {previewDirectUrl && (
                  <>
                    <a href={previewDirectUrl} target="_blank" rel="noreferrer" className="td-mi-btn td-mi-btn-edit">
                      Open file
                    </a>
                    <a href={previewDirectUrl} download className="td-mi-btn td-mi-btn-small">
                      Download
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </>,
  document.body
)}
    </>
  );
}
