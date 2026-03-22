/**
 * Market Intelligence briefs for Trader Deck – date-scoped Daily or Weekly.
 * Preview in-modal only (no new tab / no direct download flow). Admin: upload, delete.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Api from '../../services/Api';
import { FaEye, FaTrash, FaPlus, FaTimes } from 'react-icons/fa';

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024; // client guard; serverless may still cap body size

function googleViewerEmbedUrl(fileUrl) {
  const u = (fileUrl || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(u)}&embedded=true`;
}

export default function MarketIntelligenceBriefsView({ selectedDate, period, canEdit }) {
  const type = period === 'weekly' ? 'intel-weekly' : 'intel-daily';
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addSuccess, setAddSuccess] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewEmbedUrl, setPreviewEmbedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const fileInputRef = useRef(null);

  const previewOpen = Boolean(previewId || previewEmbedUrl);

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewEmbedUrl(null);
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

  const handlePreview = (brief) => {
    const ext = (brief.fileUrl || '').trim();
    if (ext) {
      const embed = googleViewerEmbedUrl(ext);
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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB on this deployment). Use “Add link” or a smaller PDF.`);
      return;
    }
    const title = uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, '') || 'Brief';
    const dateStr = String(selectedDate).trim().slice(0, 10);
    setUploading(true);
    setError(null);
    setAddSuccess(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError('Could not read the file. Try another file or use a link.');
      setUploading(false);
    };
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result.replace(/^data:[^;]+;base64,/, '') : '';
      Api.uploadTraderDeckBrief({
        date: dateStr,
        period,
        title,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
        .then(() => {
          setUploadTitle('');
          setAddSuccess(`Saved for ${dateStr}. Use the calendar to pick that day anytime.`);
          setTimeout(() => setAddSuccess(null), 4000);
          return Api.getTraderDeckContent(type, dateStr);
        })
        .then((res) => setBriefs(Array.isArray(res.data?.briefs) ? res.data.briefs : []))
        .catch((err) => setError(err.response?.data?.message || err.message || 'Upload failed'))
        .finally(() => setUploading(false));
    };
    reader.readAsDataURL(file);
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
              Briefs are stored per calendar date (daily or weekly mode). Preview opens inside this page — scroll to read; copying is discouraged and downloads are not linked.
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
                briefs.map((b) => (
                  <li key={b.id} className="td-deck-mi-brief-card">
                    <span className="td-deck-mi-brief-card-title">{b.title}</span>
                    <div className="td-deck-mi-brief-card-actions">
                      <button type="button" className="td-mi-btn td-mi-btn-small" onClick={() => handlePreview(b)} title="Preview in page">
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

      {previewOpen && iframeSrc && (
        <div className="td-intel-preview-overlay" onClick={closePreview} role="presentation">
          <div
            className="td-intel-preview-box td-intel-preview-box--protected"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="td-intel-preview-chrome">
              <p className="td-intel-preview-hint">Preview — scroll to read. Download is not provided here.</p>
              <button type="button" className="td-intel-preview-close" onClick={closePreview} aria-label="Close preview">
                <FaTimes />
              </button>
            </div>
            <div className="td-intel-preview-frame-wrap">
              <iframe
                title="Brief preview"
                src={iframeSrc}
                className="td-intel-preview-iframe"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
