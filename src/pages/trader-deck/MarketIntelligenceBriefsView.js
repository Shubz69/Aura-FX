/**
 * Market Intelligence briefs for Trader Deck – date-scoped Daily or Weekly.
 * Preview in a fullscreen body portal (no new tab / no direct download flow). Admin: upload, delete.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import Api from '../../services/Api';
import '../../styles/trader-deck/MarketIntelligenceBriefPreview.css';
import { FaEye, FaTrash, FaPlus, FaTimes } from 'react-icons/fa';
import CosmicBackground from '../../components/CosmicBackground';

/** Client cap (DB LONGBLOB); large files use chunked uploads to avoid HTTP 413 on Vercel. */
const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;

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
  'general',
  'stocks',
  'indices',
  'futures',
  'forex',
  'crypto',
  'commodities',
  'bonds',
  'etfs',
];
const BRIEF_KIND_LABEL = {
  aura_institutional_daily: 'Institutional Daily',
  aura_institutional_weekly: 'Institutional Weekly',
  general: 'General',
  stocks: 'Stocks',
  indices: 'Indices',
  futures: 'Futures',
  forex: 'Forex',
  crypto: 'Crypto',
  commodities: 'Commodities',
  bonds: 'Bonds',
  etfs: 'ETFs',
};

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
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addSuccess, setAddSuccess] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState(null);
  const [previewBriefMeta, setPreviewBriefMeta] = useState(null);
  const [textPreviewBody, setTextPreviewBody] = useState('');
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const fileInputRef = useRef(null);
  const sortedBriefs = useMemo(() => {
    const orderIndex = new Map(BRIEF_KIND_ORDER.map((k, i) => [k, i]));
    return [...briefs].sort((a, b) => {
      const ak = String(a?.briefKind || 'general').toLowerCase();
      const bk = String(b?.briefKind || 'general').toLowerCase();
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

  const previewOpen = Boolean(previewId || previewEmbedUrl);

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewEmbedUrl(null);
    setPreviewBriefMeta(null);
    setTextPreviewBody('');
    setTextPreviewLoading(false);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAddSuccess(null);
    const dateStr = String(selectedDate).trim().slice(0, 10);
    Api.getTraderDeckContent(type, dateStr)
      .then((res) => {
        if (cancelled) return;
        setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []);
      })
      .catch(() => {
        if (!cancelled) setBriefs([]);
        setError('Failed to load briefs');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, [type, selectedDate]);

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
        if (!cancelled) setTextPreviewBody(String(raw || '').replace(/\r\n/g, '\n'));
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

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleAddByUrl = () => {
    const url = (uploadUrl || '').trim();
    const title = (uploadTitle || 'Brief').trim() || 'Brief';
    if (!url) return;
    const dateStr = String(selectedDate).trim().slice(0, 10);
    setUploading(true);
    setError(null);
    setAddSuccess(null);
    Api.uploadTraderDeckBrief({ date: dateStr, period, title, fileUrl: url })
      .then(() => {
        setUploadTitle('');
        setUploadUrl('');
        setAddSuccess(`Saved for ${dateStr}. Open this date on the calendar to see it.`);
        setTimeout(() => setAddSuccess(null), 4000);
        return Api.getTraderDeckContent(type, dateStr);
      })
      .then((res) => setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []))
      .catch((err) => setError(err.response?.data?.message || err.message || 'Failed to add link'))
      .finally(() => setUploading(false));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB). Use “Add link” or a smaller PDF.`);
      return;
    }
    const title = uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, '') || 'Brief';
    const dateStr = String(selectedDate).trim().slice(0, 10);
    setUploading(true);
    setError(null);
    setAddSuccess(null);
    try {
      await Api.uploadTraderDeckBriefFile(file, { date: dateStr, period, title });
      setUploadTitle('');
      setAddSuccess(`Saved for ${dateStr}. Use the calendar to pick that day anytime.`);
      setTimeout(() => setAddSuccess(null), 4000);
      const res = await Api.getTraderDeckContent(type, dateStr);
      setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []);
    } catch (err) {
      const st = err.response?.status;
      setError(
        st === 413
          ? 'Request was too large for the server. Try again — large files upload in chunks automatically; if this persists, use “Add link” instead.'
          : err.response?.data?.message || err.message || 'Upload failed'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id) => {
    if (!window.confirm('Remove this brief?')) return;
    Api.deleteTraderDeckBrief(id)
      .then(() => setBriefs((prev) => prev.filter((b) => b.id !== id)))
      .catch((err) => setError(err.response?.data?.message || 'Delete failed'));
  };

  if (loading) {
    return (
      <div className="td-mi-loading td-mi-loading--page">
        <div className="td-mi-loading-pulse" aria-hidden />
        <p>Loading {period} briefs…</p>
      </div>
    );
  }

  const mainTitle = `Market Intelligence — ${period === 'weekly' ? 'Weekly' : 'Daily'} (${selectedDate})`;

  return (
    <>
      {error && <p className="td-mi-fallback-msg" role="status">{error}</p>}
      {addSuccess && <p className="td-mi-save-success" role="status">{addSuccess}</p>}
      <div className="td-deck-mi-modern">
        <header className="td-deck-mi-modern-hero">
          <div className="td-deck-mi-modern-hero-copy">
            <p className="td-deck-mo-eyebrow">Market intelligence</p>
            <h1 className="td-deck-mi-modern-title">{mainTitle}</h1>
            <p className="td-deck-mi-modern-sub">
              Briefs are stored per calendar date (daily or weekly mode). Preview opens as a fullscreen overlay with a blurred backdrop — scroll inside the document; copying is discouraged and downloads are not linked from the list.
            </p>
          </div>
          {briefs.length > 0 && (
            <div className="td-deck-mi-modern-stat" aria-hidden>
              <span className="td-deck-mi-modern-stat-value">{briefs.length}</span>
              <span className="td-deck-mi-modern-stat-label">brief{briefs.length !== 1 ? 's' : ''} this date</span>
            </div>
          )}
        </header>

        <div className="td-deck-mi-modern-grid">
          {canEdit && (
            <section className="td-deck-mi-tile td-deck-mi-tile--upload" aria-labelledby="intel-upload-heading">
              <h2 id="intel-upload-heading" className="td-deck-mi-tile-title">Add brief</h2>
              <p className="td-deck-mi-tile-hint">Assigns to <strong>{String(selectedDate).trim().slice(0, 10)}</strong> — change the desk calendar date before upload if needed.</p>
              <div className="td-deck-mi-upload-stack">
                <input
                  type="text"
                  className="td-mi-edit-input td-deck-mi-input-full"
                  placeholder="Brief title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pptx,.ppt,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div className="td-deck-mi-upload-actions">
                  <button
                    type="button"
                    className="td-mi-btn td-mi-btn-edit"
                    onClick={handleUploadClick}
                    disabled={uploading}
                  >
                    <FaPlus aria-hidden /> {uploading ? 'Uploading…' : 'Upload file'}
                  </button>
                </div>
                <div className="td-deck-mi-url-row">
                  <input
                    type="url"
                    className="td-mi-edit-input td-deck-mi-input-grow"
                    placeholder="Or paste a public https link to the document"
                    value={uploadUrl}
                    onChange={(e) => setUploadUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="td-mi-btn td-mi-btn-small"
                    onClick={handleAddByUrl}
                    disabled={uploading || !uploadUrl.trim()}
                  >
                    Add link
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="td-deck-mi-tile td-deck-mi-tile--list" aria-labelledby="intel-list-heading">
            <div className="td-deck-mi-tile-head">
              <h2 id="intel-list-heading" className="td-deck-mi-tile-title">Briefs</h2>
              <span className="td-deck-mi-tile-badge">{briefs.length}</span>
            </div>
            <ul className="td-deck-mi-brief-cards">
              {briefs.length === 0 ? (
                <li className="td-deck-mi-brief-empty">No briefs for this date. {canEdit && 'Pick the date above, then add a file or link.'}</li>
              ) : (
                sortedBriefs.map((b) => (
                  <li key={b.id} className="td-deck-mi-brief-card">
                    <span className="td-deck-mi-brief-card-title">
                      [{BRIEF_KIND_LABEL[String(b?.briefKind || 'general').toLowerCase()] || 'General'}] {displayBriefTitle(b.title)}{Number(b?.briefVersion || 1) > 1 ? ` (v${Number(b.briefVersion)})` : ''}
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
            <div className="td-intel-preview-md-scroll" aria-busy={textPreviewLoading}>
              {textPreviewLoading ? (
                <p className="td-intel-preview-md-loading">Loading brief…</p>
              ) : (
                <div className="td-intel-brief-md">
                  <ReactMarkdown
                    components={{
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                    }}
                  >
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
