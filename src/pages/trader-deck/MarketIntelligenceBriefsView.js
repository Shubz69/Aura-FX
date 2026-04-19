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
import { stripModelInternalExposition } from '../../utils/sanitizeAiDeskOutput.react.js';
import {
  polishBriefMarkdown,
  splitLongProseParagraphsForPreview,
} from '../../utils/briefPresentationSanitize';
import { promoteAuraBriefPlaintextToMarkdown } from '../../utils/promoteAuraBriefHeadings';

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
  let t = String(title || '').replace(/^\s*\[AUTO\]\s*/i, '').trim();
  t = t.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\1\b/gi, '$1');
  return t || 'Brief';
}

function formatDeskDateBritishLong(iso) {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '';
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const BRIEF_KIND_ORDER = [
  'aura_sunday_market_open',
  'aura_institutional_daily_forex',
  'aura_institutional_daily_crypto',
  'aura_institutional_daily_commodities',
  'aura_institutional_daily_etfs',
  'aura_institutional_daily_stocks',
  'aura_institutional_daily_indices',
  'aura_institutional_daily_bonds',
  'aura_institutional_daily_futures',
  'aura_institutional_weekly_forex',
  'aura_institutional_weekly_crypto',
  'aura_institutional_weekly_commodities',
  'aura_institutional_weekly_etfs',
  'aura_institutional_weekly_stocks',
  'aura_institutional_weekly_indices',
  'aura_institutional_weekly_bonds',
  'aura_institutional_weekly_futures',
];
const BRIEF_KIND_LABEL = {
  aura_sunday_market_open: 'Sunday Market Open Brief',
  aura_institutional_daily_forex: 'Daily Brief — Forex',
  aura_institutional_daily_crypto: 'Daily Brief — Crypto',
  aura_institutional_daily_commodities: 'Daily Brief — Commodities',
  aura_institutional_daily_etfs: 'Daily Brief — ETFs',
  aura_institutional_daily_stocks: 'Daily Brief — Stocks',
  aura_institutional_daily_indices: 'Daily Brief — Indices',
  aura_institutional_daily_bonds: 'Daily Brief — Bonds',
  aura_institutional_daily_futures: 'Daily Brief — Futures',
  aura_institutional_weekly_forex: 'WFA Forex',
  aura_institutional_weekly_crypto: 'WFA Crypto',
  aura_institutional_weekly_commodities: 'WFA Commodities',
  aura_institutional_weekly_etfs: 'WFA ETFs',
  aura_institutional_weekly_stocks: 'WFA Stocks',
  aura_institutional_weekly_indices: 'WFA Indices',
  aura_institutional_weekly_bonds: 'WFA Bonds',
  aura_institutional_weekly_futures: 'WFA Futures',
};

/** One-line title on cards: strip duplicate “[Daily Brief — X] …” prefix; keep desk line. */
function displayBriefCardSubtitle(title, briefKind) {
  const label = BRIEF_KIND_LABEL[String(briefKind || '').toLowerCase()];
  let t = displayBriefTitle(title);
  if (label) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^\\s*\\[\\s*${esc}\\s*\\]\\s*`, 'i'), '').trim();
  }
  t = t.replace(/^\s*(?:WFA|Daily Brief|Weekly Brief)\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s*[—–-]\s*/i, '').trim();
  return t || displayBriefTitle(title);
}

const CATEGORY_BRIEF_KINDS = new Set([
  'forex',
  'crypto',
  'commodities',
  'etfs',
  'stocks',
  'indices',
  'bonds',
  'futures',
]);

/** Fixed eight-sleeve grid order (institutional WFA only; Sunday open is a separate row when daily). */
const INTEL_SLEEVE_ORDER_DAILY = [
  'aura_institutional_daily_forex',
  'aura_institutional_daily_crypto',
  'aura_institutional_daily_commodities',
  'aura_institutional_daily_etfs',
  'aura_institutional_daily_stocks',
  'aura_institutional_daily_indices',
  'aura_institutional_daily_bonds',
  'aura_institutional_daily_futures',
];
const INTEL_SLEEVE_ORDER_WEEKLY = [
  'aura_institutional_weekly_forex',
  'aura_institutional_weekly_crypto',
  'aura_institutional_weekly_commodities',
  'aura_institutional_weekly_etfs',
  'aura_institutional_weekly_stocks',
  'aura_institutional_weekly_indices',
  'aura_institutional_weekly_bonds',
  'aura_institutional_weekly_futures',
];

/** Matches `/api/trader-deck/content` intel payload (eight sleeves + optional Sunday open). */
const INTEL_API_BRIEF_KIND_RE =
  /^aura_sunday_market_open$|^aura_institutional_daily_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$|^aura_institutional_weekly_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/;

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
  // Legacy bodies: "##" glued to end of sentence → split so ReactMarkdown sees real headings.
  t = t.replace(/([^\n#])\s*(#{2,6}\s+)/g, '$1\n\n$2');

  // Strip ```fences``` (keep inner text); strip inline backticks from legacy docs.
  t = t.replace(/```(?:[\w-]+)?\s*\n?([\s\S]*?)```/g, (_, inner) => `\n${String(inner || '').trim()}\n`);
  t = t.replace(/`([^`\n]+)`/g, '$1');

  t = promoteAuraBriefPlaintextToMarkdown(t);

  t = t.replace(/^\s*By\s+Aura\s+FX\s+AI\s*$/gim, '');
  t = t.replace(/^\s*By\s+AURA\s+TERMINAL\s*$/gim, '');

  t = stripModelInternalExposition(t);
  t = polishBriefMarkdown(t, { preserveEmphasis: true });
  t = splitLongProseParagraphsForPreview(t);

  const endsWithFooter = new RegExp(
    `${BY_AURA_TERMINAL.replace(/\s+/g, '\\s+')}\\s*$`,
    'i'
  ).test(t);
  if (!endsWithFooter) {
    t = `${t}\n\n${BY_AURA_TERMINAL}`;
  }
  return t.trim();
}

function normalizeBriefsList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((b) => b && typeof b === 'object')
    .filter((b) => INTEL_API_BRIEF_KIND_RE.test(String(b.briefKind || '').toLowerCase()));
}

const BRIEF_POLL_MS = 3000;
const BRIEF_POLL_MAX = 15;
/** Partial-pack polling may need longer while several category briefs generate server-side. */
const BRIEF_PARTIAL_POLL_MAX = 60;

/** Empty list: plain copy only — no row counts, automation flags, or admin runbooks in the UI. */
function emptyDeskMessagesFor(period, phase) {
  const weekly = period === 'weekly';
  const userFirst = weekly
    ? 'No weekly briefs for this desk week yet. When ready, eight weekly fundamental briefs appear here (Forex through Futures). Try another week or tap Retry.'
    : 'No briefs for this date yet. When ready, eight daily briefs appear here (Forex, Crypto, Commodities, ETFs, Stocks, Indices, Bonds, Futures). Try another date or tap Retry.';
  const userRepeat = weekly
    ? 'No weekly briefs for this desk week yet. Try another week or tap Retry.'
    : 'No briefs for this date yet. Try another date or tap Retry.';
  return { userText: phase === 'first' ? userFirst : userRepeat };
}

function briefsPayloadFromContentResponse(res, fallbackStorageDate) {
  const raw = Array.isArray(res.data?.briefs) ? res.data.briefs : [];
  const list = normalizeBriefsList(raw);
  const weekendFallback = Boolean(res.data?.weekendFallback);
  const requestedDeskDate = String(res.data?.date || fallbackStorageDate || '').trim().slice(0, 10);
  const packFileDate = String(res.data?.briefsSourceDate || requestedDeskDate).trim().slice(0, 10);
  const apiType = String(res.data?.type || '').toLowerCase();
  const isWeeklyApi = apiType.includes('weekly');
  const showDeskPackShiftNote =
    !isWeeklyApi &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDeskDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(packFileDate) &&
    requestedDeskDate !== packFileDate;
  const briefsRowCount =
    typeof res.data?.briefsRowCount === 'number' ? res.data.briefsRowCount : raw.length;
  const deskAutomationConfigured = Boolean(res.data?.deskAutomationConfigured);
  const categorySleevePack =
    res.data?.categorySleevePack && typeof res.data.categorySleevePack === 'object'
      ? res.data.categorySleevePack
      : null;
  return {
    list,
    weekendNote:
      weekendFallback || showDeskPackShiftNote
        ? { packSourceDate: packFileDate, requestedDeskDate }
        : null,
    deskMeta: {
      briefsRowCount,
      deskAutomationConfigured,
      categorySleevePack,
      /** Same as server `briefs` array length before client filter (for admin diagnosis). */
      rawBriefsFromApi: raw.length,
      afterFilterCount: list.length,
    },
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
  /** Progressive reveal for text/markdown briefs (typewriter-style after load). */
  const [typedMarkdownBody, setTypedMarkdownBody] = useState('');
  const [briefTypewriterActive, setBriefTypewriterActive] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState(null);
  const [selectedKinds, setSelectedKinds] = useState(() => new Set(BRIEF_KIND_ORDER));
  /** UK weekend daily view: server serves previous weekday’s briefs */
  const [weekendBriefsNote, setWeekendBriefsNote] = useState(null);
  /** When the desk date has zero stored briefs: safe user copy + optional admin-only hint */
  const [emptyDeskMessages, setEmptyDeskMessages] = useState(null);
  /** Last GET intel payload diagnostics (non-secret; helps admins see DB vs automation). */
  const [intelDeskMeta, setIntelDeskMeta] = useState(null);
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

  const filtersAreDefault = useMemo(
    () =>
      selectedKinds.size === BRIEF_KIND_ORDER.length &&
      BRIEF_KIND_ORDER.every((k) => selectedKinds.has(k)),
    [selectedKinds]
  );

  const displayedBriefs = useMemo(() => {
    if (!sortedBriefs.length) return [];
    return sortedBriefs.filter((b) => selectedKinds.has(String(b?.briefKind || '').toLowerCase()));
  }, [sortedBriefs, selectedKinds]);

  const intelSleeveOrder = useMemo(
    () => (period === 'weekly' ? INTEL_SLEEVE_ORDER_WEEKLY : INTEL_SLEEVE_ORDER_DAILY),
    [period]
  );

  const briefByKind = useMemo(() => {
    const m = new Map();
    for (const b of sortedBriefs) {
      const k = String(b?.briefKind || '').toLowerCase();
      if (k) m.set(k, b);
    }
    return m;
  }, [sortedBriefs]);

  const sundayMarketBrief = useMemo(() => {
    if (period !== 'daily') return null;
    return (
      sortedBriefs.find((b) => String(b?.briefKind || '').toLowerCase() === 'aura_sunday_market_open') || null
    );
  }, [sortedBriefs, period]);

  const categoryBriefCount = useMemo(() => {
    const re =
      period === 'weekly'
        ? /^aura_institutional_weekly_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/
        : /^aura_institutional_daily_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/;
    return briefs.filter((b) => re.test(String(b?.briefKind || '').toLowerCase())).length;
  }, [briefs, period]);

  const hasInstitutionalBrief = useMemo(() => {
    const re =
      period === 'weekly'
        ? /^aura_institutional_weekly_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/
        : /^aura_institutional_daily_(forex|crypto|commodities|etfs|stocks|indices|bonds|futures)$/;
    return briefs.some((b) => re.test(String(b?.briefKind || '').toLowerCase()));
  }, [briefs, period]);

  const categorySleevesLoaded =
    typeof intelDeskMeta?.categorySleevePack?.loaded === 'number'
      ? intelDeskMeta.categorySleevePack.loaded
      : categoryBriefCount;

  /** Server may be gap-filling remaining sleeves in the background — keep polling until the full pack lands. */
  const needsPartialIntelPoll = useMemo(() => {
    const onlySundayOpen =
      period === 'daily' &&
      briefs.length === 1 &&
      String(briefs[0]?.briefKind || '').toLowerCase() === 'aura_sunday_market_open';
    if (onlySundayOpen) return false;
    return (
      Boolean(intelDeskMeta?.deskAutomationConfigured) &&
      briefs.length > 0 &&
      (categorySleevesLoaded < CATEGORY_BRIEF_KINDS.size || !hasInstitutionalBrief)
    );
  }, [
    period,
    intelDeskMeta?.deskAutomationConfigured,
    intelDeskMeta?.categorySleevePack?.loaded,
    briefs,
    categorySleevesLoaded,
    hasInstitutionalBrief,
  ]);

  const packSourceDateLabel = useMemo(() => {
    const iso = weekendBriefsNote?.packSourceDate || weekendBriefsNote?.sourceDate;
    return formatDeskDateBritishLong(iso);
  }, [weekendBriefsNote]);

  const requestedDeskDateLabel = useMemo(
    () => formatDeskDateBritishLong(weekendBriefsNote?.requestedDeskDate),
    [weekendBriefsNote]
  );

  const previewOpen = Boolean(previewId || previewEmbedUrl);

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewEmbedUrl(null);
    setPreviewBriefMeta(null);
    setTextPreviewBody('');
    setTextPreviewLoading(false);
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
    (opts = {}) => {
      const cacheBust = opts.cacheBust ?? false;
      const autogen = opts.autogen ?? false;
      return Api.getTraderDeckContent(type, storageDateStr, {
        cacheBust: !!cacheBust,
        /** `autogen=1` kicks server gap-fill (institutional + missing category sleeves); use only when polling partial packs or explicit retry. */
        autogen: !!autogen,
      }).then((res) => briefsPayloadFromContentResponse(res, storageDateStr));
    },
    [type, storageDateStr]
  );

  const handleManualBriefsRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBriefsPayload({ cacheBust: true, autogen: true })
      .then((payload) => {
        setBriefs(payload.list);
        setWeekendBriefsNote(payload.weekendNote);
        setIntelDeskMeta(payload.deskMeta ?? null);
        if (payload.list.length > 0) {
          setEmptyDeskMessages(null);
        } else {
          setEmptyDeskMessages(emptyDeskMessagesFor(period, 'repeat'));
        }
      })
      .catch(() => setError('Failed to load briefs'))
      .finally(() => setLoading(false));
  }, [fetchBriefsPayload, period]);

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

    fetchBriefsPayload({})
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
            setEmptyDeskMessages(emptyDeskMessagesFor(period, 'first'));
            Api.getTraderDeckContent(type, storageDateStr, { autogen: true }).catch(() => {});
          } else {
            setEmptyDeskMessages(emptyDeskMessagesFor(period, 'repeat'));
          }
        } catch (_) {
          setEmptyDeskMessages(emptyDeskMessagesFor(period, 'repeat'));
        }

        pollTimer = setInterval(() => {
          if (cancelled) return;
          pollCount += 1;
          if (pollCount > BRIEF_POLL_MAX) {
            clearInterval(pollTimer);
            pollTimer = null;
            return;
          }
          fetchBriefsPayload({ cacheBust: true })
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
  }, [type, period, storageDateStr, fetchBriefsPayload]);

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
      fetchBriefsPayload({ cacheBust: true, autogen: true })
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
    if (!previewUseMarkdown) {
      setTypedMarkdownBody('');
      setBriefTypewriterActive(false);
      return undefined;
    }
    if (textPreviewLoading) {
      setTypedMarkdownBody('');
      setBriefTypewriterActive(false);
      return undefined;
    }
    const full = String(textPreviewBody || '');
    if (!full.trim()) {
      setTypedMarkdownBody('');
      setBriefTypewriterActive(false);
      return undefined;
    }

    setBriefTypewriterActive(true);
    setTypedMarkdownBody('');

    const fullLen = full.length;
    const TICK_MS = 18;
    const TARGET_MS = 10000;
    const steps = Math.max(1, Math.ceil(TARGET_MS / TICK_MS));
    const stepChars = Math.max(2, Math.ceil(fullLen / steps));

    let pos = 0;
    let cancelled = false;
    let timeoutId = null;

    const step = () => {
      if (cancelled) return;
      pos = Math.min(fullLen, pos + stepChars);
      setTypedMarkdownBody(full.slice(0, pos));
      if (pos >= fullLen) {
        setBriefTypewriterActive(false);
        return;
      }
      timeoutId = window.setTimeout(step, TICK_MS);
    };

    timeoutId = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      setBriefTypewriterActive(false);
    };
  }, [previewUseMarkdown, textPreviewLoading, textPreviewBody, previewId]);

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
      <div className="td-deck-mi-modern">
        <header className="td-deck-mi-modern-hero">
          <div className="td-deck-mi-modern-hero-copy">
            <p className="td-deck-mo-eyebrow">Market intelligence</p>
            <h1 className="td-deck-mi-modern-title">{mainTitle}</h1>
            <p className="td-deck-mi-modern-sub">
              Open a brief to read it fullscreen.{' '}
              {period === 'weekly'
                ? 'Eight weekly fundamental briefs fill in when the server has finished generating them for the week you selected.'
                : 'Eight daily briefs fill in when the server has finished generating them for the date you selected.'}
            </p>
            {period === 'weekly' && weekRangeLabel && (
              <p className="td-deck-mi-modern-sub td-deck-mi-week-range-key" role="note">
                Coverage is <strong>{weekRangeLabel}</strong> (London, Mon–Fri). Rows are stored under week-ending
                Sunday <strong>{storageDateStr}</strong>; titles may mention the Sunday filing date — that is the desk
                key, not an extra trading day.
              </p>
            )}
            {period === 'daily' && weekendBriefsNote && (
              <p className="td-deck-mi-modern-sub td-deck-mi-weekend-note" role="note">
                Desk date <strong>{requestedDeskDateLabel}</strong> uses the latest automated pack on file from{' '}
                <strong>{packSourceDateLabel}</strong> (weekends and non-session days reuse the previous UK weekday
                pack). In-body titles name that session day.
              </p>
            )}
          </div>
          {!loading && (
            <div className="td-deck-mi-modern-stat" aria-hidden>
              <span className="td-deck-mi-modern-stat-value">
                {categorySleevesLoaded}/8
              </span>
              <span className="td-deck-mi-modern-stat-label">
                asset sleeves stored (of 8)
                {hasInstitutionalBrief ? ' · ready' : ' · generating'}
                {weekendBriefsNote ? ' · desk pack shift' : ''}
              </span>
            </div>
          )}
        </header>

        {!filtersAreDefault && (
          <p className="td-deck-mi-filter-active-banner" role="status">
            Some sleeve cards are hidden by filters — use Show all types to reveal every loaded brief.{' '}
            <button type="button" className="td-mi-btn td-mi-btn-small" onClick={clearFilters}>
              Show all types
            </button>
          </p>
        )}

        <div className="td-deck-mi-modern-grid">
          <section className="td-deck-mi-tile td-deck-mi-tile--list" aria-labelledby="intel-list-heading">
            <div className="td-deck-mi-tile-head">
              <h2 id="intel-list-heading" className="td-deck-mi-tile-title">
                Briefs
              </h2>
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
                    Filter types
                  </button>
                </div>
                <span className="td-deck-mi-tile-badge" title="Rows shown after filters">
                  {filtersAreDefault
                    ? `${sortedBriefs.length} brief${sortedBriefs.length !== 1 ? 's' : ''}`
                    : `${displayedBriefs.length} / ${sortedBriefs.length}`}
                </span>
              </div>
            </div>
            <ul className="td-deck-mi-brief-cards td-deck-mi-brief-cards--sleeve-grid">
              {error ? (
                <li className="td-deck-mi-brief-empty td-deck-mi-brief-empty--fullwidth">
                  <span className="td-deck-mi-empty-user" role="alert">
                    We could not load briefs (connection or server issue). Check your network, then try again.
                  </span>{' '}
                  <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
                    Retry fetch
                  </button>
                </li>
              ) : sortedBriefs.length === 0 && emptyDeskMessages ? (
                <>
                  <li className="td-deck-mi-brief-empty td-deck-mi-brief-empty--fullwidth">
                    <span className="td-deck-mi-empty-user">{emptyDeskMessages.userText}</span>{' '}
                    <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
                      Retry fetch
                    </button>
                  </li>
                  {intelSleeveOrder.map((kind) => (
                    <li key={kind} className="td-deck-mi-brief-card td-deck-mi-brief-card--pending">
                      <span className="td-deck-mi-brief-card-title">{BRIEF_KIND_LABEL[kind] || kind}</span>
                      <span className="td-deck-mi-brief-pending">Awaiting generation</span>
                    </li>
                  ))}
                </>
              ) : sortedBriefs.length === 0 ? (
                <li className="td-deck-mi-brief-empty td-deck-mi-brief-empty--fullwidth">
                  <span className="td-deck-mi-empty-user">No briefs for this date.</span>{' '}
                  <button type="button" className="td-mi-btn td-mi-btn-small" onClick={handleManualBriefsRetry}>
                    Retry fetch
                  </button>
                </li>
              ) : (
                <>
                  {period === 'daily' && sundayMarketBrief && (
                    <li
                      key="aura_sunday_market_open"
                      className={`td-deck-mi-brief-card${selectedKinds.has('aura_sunday_market_open') ? '' : ' td-deck-mi-brief-card--filtered'}`}
                    >
                      {selectedKinds.has('aura_sunday_market_open') ? (
                        <>
                          <span className="td-deck-mi-brief-card-titles">
                            <span className="td-deck-mi-brief-card-kicker">{BRIEF_KIND_LABEL.aura_sunday_market_open}</span>
                            <span className="td-deck-mi-brief-card-title">
                              {displayBriefCardSubtitle(sundayMarketBrief.title, sundayMarketBrief.briefKind)}
                              {Number(sundayMarketBrief?.briefVersion || 1) > 1
                                ? ` (v${Number(sundayMarketBrief.briefVersion)})`
                                : ''}
                            </span>
                          </span>
                          <div className="td-deck-mi-brief-card-actions">
                            <button
                              type="button"
                              className="td-mi-btn td-mi-btn-small"
                              onClick={() => handlePreview(sundayMarketBrief)}
                              title="Fullscreen preview"
                            >
                              <FaEye /> Preview
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                className="td-mi-btn td-mi-btn-remove"
                                onClick={() => handleDelete(sundayMarketBrief.id)}
                                title="Remove"
                              >
                                <FaTrash />
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="td-deck-mi-brief-card-title">{BRIEF_KIND_LABEL.aura_sunday_market_open}</span>
                          <span className="td-deck-mi-brief-pending">Hidden by filters</span>
                          <button type="button" className="td-mi-btn td-mi-btn-small" onClick={clearFilters}>
                            Show all
                          </button>
                        </>
                      )}
                    </li>
                  )}
                  {intelSleeveOrder.map((kind) => {
                    const b = briefByKind.get(kind);
                    if (!b) {
                      return (
                        <li key={kind} className="td-deck-mi-brief-card td-deck-mi-brief-card--pending">
                          <span className="td-deck-mi-brief-card-title">{BRIEF_KIND_LABEL[kind] || kind}</span>
                          <span className="td-deck-mi-brief-pending">Awaiting generation</span>
                        </li>
                      );
                    }
                    if (!selectedKinds.has(kind)) {
                      return (
                        <li key={kind} className="td-deck-mi-brief-card td-deck-mi-brief-card--filtered">
                          <span className="td-deck-mi-brief-card-title">{BRIEF_KIND_LABEL[kind] || kind}</span>
                          <span className="td-deck-mi-brief-pending">Hidden by filters</span>
                          <button type="button" className="td-mi-btn td-mi-btn-small" onClick={clearFilters}>
                            Show all
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={b.id} className="td-deck-mi-brief-card">
                        <span className="td-deck-mi-brief-card-titles">
                          <span className="td-deck-mi-brief-card-kicker">
                            {BRIEF_KIND_LABEL[String(b?.briefKind || '').toLowerCase()] || 'Brief'}
                          </span>
                          <span className="td-deck-mi-brief-card-title">
                            {displayBriefCardSubtitle(b.title, b.briefKind)}
                            {Number(b?.briefVersion || 1) > 1 ? ` (v${Number(b.briefVersion)})` : ''}
                          </span>
                        </span>
                        <div className="td-deck-mi-brief-card-actions">
                          <button
                            type="button"
                            className="td-mi-btn td-mi-btn-small"
                            onClick={() => handlePreview(b)}
                            title="Fullscreen preview"
                          >
                            <FaEye /> Preview
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="td-mi-btn td-mi-btn-remove"
                              onClick={() => handleDelete(b.id)}
                              title="Remove"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
            {canEdit && intelDeskMeta && typeof intelDeskMeta.rawBriefsFromApi === 'number' && (
              <p className="td-deck-mi-admin-intel-diag" role="status">
                Admin — last API brief rows: {intelDeskMeta.rawBriefsFromApi}; after client filter: {briefs.length}.
                {storageDateStr ? ` Query storage date: ${storageDateStr}.` : ''}
                {intelDeskMeta.rawBriefsFromApi > 0 && briefs.length === 0
                  ? ' All rows dropped by filter (check briefKind slugs vs INTEL_API_BRIEF_KIND_RE).'
                  : ''}
              </p>
            )}
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
          <div className="td-intel-preview-chrome-main">
            <p className="td-intel-preview-title-bar" title={displayBriefTitle(previewBriefMeta?.title)}>
              {displayBriefTitle(previewBriefMeta?.title)}
            </p>
            {(period === 'weekly' && weekRangeLabel) || (period === 'daily' && weekendBriefsNote) ? (
              <p className="td-intel-preview-desk-context">
                {period === 'weekly' && weekRangeLabel
                  ? `Coverage ${weekRangeLabel} · desk week-ending Sunday ${storageDateStr}`
                  : `Pack on file ${packSourceDateLabel} · desk date ${requestedDeskDateLabel}`}
              </p>
            ) : null}
          </div>
          <button type="button" className="td-intel-preview-close--floating" onClick={closePreview} aria-label="Close preview">
            <FaTimes />
          </button>
        </div>
        <div className="td-intel-preview-frame-wrap">
          {previewUseMarkdown ? (
            <div
              className="td-intel-preview-md-scroll"
              aria-busy={textPreviewLoading || briefTypewriterActive}
            >
              {textPreviewLoading ? (
                <p className="td-intel-preview-md-loading">Loading brief…</p>
              ) : (
                <div className="td-intel-brief-md-document">
                  <div className="td-intel-brief-md td-intel-brief-md--typewriter">
                  <ReactMarkdown components={BRIEF_MARKDOWN_COMPONENTS}>
                    {typedMarkdownBody.length > 0
                      ? typedMarkdownBody
                      : String(textPreviewBody || '').trim()
                        ? '\u00a0'
                        : '_No text content._'}
                  </ReactMarkdown>
                  {briefTypewriterActive ? (
                    <span className="td-intel-brief-md-typewriter-caret" aria-hidden />
                  ) : null}
                  </div>
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
